"""Minimal account/worker setup for Kisara; never return stored credentials."""
import asyncio
import json
import uuid
import logging
logger = logging.getLogger("uvicorn.error")
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
import time
import base64
from pydantic import BaseModel, Field
from ..core.auth import verify_api_key_header
from ..core.config import config
from ..services.browser_captcha_extension import ExtensionCaptchaService

_media_uploads = {}
_lock = asyncio.Lock()
_browser_lock = asyncio.Lock()
_state_file = Path(__file__).resolve().parents[2] / 'data' / 'kisara-browser-pending.json'
try:
    _uncertain_accounts = set(json.loads(_state_file.read_text()) if _state_file.exists() else [])
    _state_valid = all(isinstance(v, int) and v > 0 for v in _uncertain_accounts)
except Exception:
    _uncertain_accounts, _state_valid = set(), False

def _save_browser_state():
    _state_file.parent.mkdir(parents=True, exist_ok=True)
    temporary = _state_file.with_suffix('.tmp')
    temporary.write_text(json.dumps(sorted(_uncertain_accounts)))
    temporary.replace(_state_file)


class BrowserInspect(BaseModel):
    account_id: int = Field(gt=0)
    action: Literal['inspect', 'inspect_upload', 'inspect_frames', 'settings', 'prepare_image'] = 'inspect'

class BrowserImage(BaseModel):
    video_input_mode: Literal['agent', 'frames'] = 'agent'
    recover: bool = False
    kind: Literal['image', 'video'] = 'image'
    references: list[str] = Field(default_factory=list, max_length=3)
    account_id: int = Field(gt=0)
    prompt: str = Field(min_length=1, max_length=7000)
    aspect: Literal['16:9', '9:16'] = '16:9'

class RoutePair(BaseModel):
    account_id: int = Field(gt=0)
    route_key: str = Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')

def create_kisara_router(database, manager):
    router = APIRouter(dependencies=[Depends(verify_api_key_header)])

    async def snapshot():
        db = database()
        service = await ExtensionCaptchaService.get_instance(db)
        workers = [{'routeKey': c.route_key, 'label': c.client_label[:80]} for c in service.active_connections]
        accounts = []
        for row in await db.get_all_tokens_with_stats():
            connected, route = await service.has_connection_for_token(row['id'])
            accounts.append({'id': row['id'], 'email': str(row.get('email') or 'Akun ' + str(row['id']))[:254], 'routeKey': route, 'workerConnected': connected, 'active': bool(row.get('is_active')), 'imageEnabled': bool(row.get('image_enabled', True))})
        return {'browserFramesVersion': 1, 'browserMediaVersion': 2, 'accounts': accounts, 'workers': workers, 'extensionMode': config.captcha_method == 'extension'}

    @router.get('/api/kisara/status')
    async def status():
        return await snapshot()

    @router.post('/api/kisara/browser/inspect')
    async def inspect_browser(request: BrowserInspect):
        data = await snapshot()
        account = next((a for a in data['accounts'] if a['id'] == request.account_id), None)
        if not account or not account['workerConnected'] or not account['routeKey']:
            raise HTTPException(409, 'Akun belum terhubung ke worker Chrome.')
        service = await ExtensionCaptchaService.get_instance(database())
        matching = [c for c in service.active_connections if c.route_key == account['routeKey']]
        if len(matching) != 1:
            raise HTTPException(409, 'Profil worker harus unik. Periksa Route Key.')
        connection = matching[0]
        request_id = 'inspect_' + uuid.uuid4().hex
        future = asyncio.get_running_loop().create_future()
        service.pending_requests[request_id] = (future, connection.websocket)
        try:
            await connection.websocket.send_text(json.dumps({'type': 'inspect_flow_ui', 'req_id': request_id, 'action': request.action}))
            result = await asyncio.wait_for(future, timeout=12)
            if result.get('status') != 'success' or not isinstance(result.get('inspection'), dict):
                raise HTTPException(409, 'Buka tepat satu proyek Flow pada profil akun ini. Pemeriksaan belum berhasil.')
            inspection = result['inspection']
            if isinstance(inspection.get('failure'), dict):
                code = inspection['failure'].get('code')
                raise HTTPException(409, code if code in {'google_blocked','browser_not_ready'} else 'browser_not_ready')
            if isinstance(inspection.get('errorCode'), str) and inspection['errorCode'] in {'existing_draft','browser_busy','settings_not_unique','image_model_not_verified','image_settings_not_unique','prompt_not_found','google_blocked','browser_not_ready','unsupported_input'}:
                raise HTTPException(409, inspection['errorCode'])
            if inspection.get('host') != 'flow.google.com':
                raise HTTPException(409, 'Halaman proyek Flow belum terbuka.')
            # Only return control metadata; never return cookies, session tokens or editor text.
            def text(value):
                return value[:100] if isinstance(value, str) else ''
            fields = inspection.get('fields', [])
            buttons = inspection.get('buttons', [])
            return {
                'pending': [{k: text(v.get(k)) for k in ('tag','parent','text')} for v in inspection.get('pending', [])[:12] if isinstance(v,dict)],
                'uploads': {
                    'inputs': [{'accept': text(v.get('accept')), 'multiple': v.get('multiple') is True, 'parent': text(v.get('parent'))} for v in inspection.get('uploads', {}).get('inputs', [])[:12] if isinstance(v, dict)],
                    'ancestry': [{'tag': text(v.get('tag')), 'classes': text(v.get('classes')), 'images': v.get('images') if isinstance(v.get('images'), int) else 0} for v in inspection.get('uploads', {}).get('ancestry', [])[:7] if isinstance(v, dict)]
                } if isinstance(inspection.get('uploads'), dict) else {},
                'composer': {k: v for k, v in inspection.get('composer', {}).items() if k in {'editors','draftLength','submitCount','submitDisabled','busy','online'} and isinstance(v, (bool, int))} if isinstance(inspection.get('composer'), dict) else {},
                'host': 'flow.google.com',
                'projectOpen': inspection.get('projectOpen') is True,
                'blocked': inspection.get('blocked') is True,
                'fields': [{k: text(item.get(k)) for k in ('tag', 'role', 'label', 'placeholder')} for item in fields[:12] if isinstance(item, dict)] if isinstance(fields, list) else [],
                'options': [text(value) for value in inspection.get('options', [])[:40] if isinstance(value, str)] if isinstance(inspection.get('options'), list) else [],
                'buttons': [{'label': text(item.get('label')), 'text': text(item.get('text')), 'disabled': item.get('disabled') is True} for item in buttons[:80] if isinstance(item, dict)] if isinstance(buttons, list) else [],
            }
        except asyncio.TimeoutError:
            raise HTTPException(504, 'Worker belum mendukung pemeriksaan browser. Muat ulang ekstensi versi 1.1.0.')
        finally:
            service.pending_requests.pop(request_id, None)

    @router.put('/api/kisara/browser/media/{request_id}')
    async def upload_media(request_id: str, request: Request):
        service = await ExtensionCaptchaService.get_instance(database())
        if request_id not in service.pending_requests:
            raise HTTPException(409, 'request_expired')
        content_type = request.headers.get('content-type', '')
        if content_type not in {'image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'}:
            raise HTTPException(400, 'unsupported_media')
        chunks, size = [], 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > 40 * 1024 * 1024: raise HTTPException(413, 'media_too_large')
            chunks.append(chunk)
        _media_uploads.clear()
        _media_uploads[request_id] = (b''.join(chunks), content_type, time.monotonic())
        return {'ok': True}

    @router.get('/api/kisara/browser/media/{request_id}')
    async def download_media(request_id: str):
        value = _media_uploads.pop(request_id, None)
        if value is None or time.monotonic() - value[2] > 300: raise HTTPException(404, 'media_expired')
        return Response(content=value[0], media_type=value[1])

    @router.post('/api/kisara/browser/image')
    async def browser_image(request: BrowserImage):
        if request.recover and request.kind != 'video': raise HTTPException(400, 'unsupported_input')
        if request.kind == 'video' and len(request.references) != 1 and not request.recover: raise HTTPException(400, 'unsupported_input')
        for ref in request.references:
            if len(ref) > 28 * 1024 * 1024 or not ref.startswith(('data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/webp;base64,')): raise HTTPException(400, 'unsupported_input')
            try: base64.b64decode(ref.split(',', 1)[1], validate=True)
            except Exception: raise HTTPException(400, 'unsupported_input')
        if not _state_valid or _browser_lock.locked() or (request.account_id in _uncertain_accounts and not request.recover):
            raise HTTPException(409, 'browser_busy_or_uncertain')
        async with _browser_lock:
            data = await snapshot()
            account = next((a for a in data['accounts'] if a['id'] == request.account_id), None)
            if not account or not account['workerConnected'] or not account['routeKey']:
                raise HTTPException(409, 'browser_not_ready')
            service = await ExtensionCaptchaService.get_instance(database())
            matching = [c for c in service.active_connections if c.route_key == account['routeKey']]
            if len(matching) != 1:
                raise HTTPException(409, 'browser_not_unique')
            connection = matching[0]
            request_id = 'browser_' + uuid.uuid4().hex
            future = asyncio.get_running_loop().create_future()
            service.pending_requests[request_id] = (future, connection.websocket)
            _uncertain_accounts.add(request.account_id)
            _save_browser_state()
            try:
                await connection.websocket.send_text(json.dumps({'type': 'inspect_flow_ui', 'req_id': request_id, 'action': 'recover_video' if request.recover and request.kind == 'video' else ('generate_frames_video' if request.video_input_mode == 'frames' else 'generate_video') if request.kind == 'video' else 'generate_reference_image' if request.references else 'generate_image', 'prompt': request.prompt, 'aspect': request.aspect, 'references': request.references}))
                logger.info('Kisara browser account=%d request=%s phase=sent_to_worker', request.account_id, request_id)
                result = await asyncio.wait_for(future, timeout=720 if request.kind == 'video' else 390)
                if result.get('status') != 'success' or isinstance(result.get('inspection'), dict) and (result['inspection'].get('errorCode') or result['inspection'].get('preSubmitError') or result['inspection'].get('failure')):
                    failure = result.get('inspection', {}).get('failure', {}) if isinstance(result.get('inspection'), dict) else {}
                    code = failure.get('code') or result.get('errorCode') or result.get('inspection', {}).get('errorCode') or result.get('inspection', {}).get('preSubmitError', 'browser_not_ready')
                    allowed = {'frames_mode_unavailable', 'frames_settings_unverified', 'start_frame_unverified', 'reference_upload_failed', 'existing_attachments', 'video_model_not_verified', 'native_input_unavailable', 'submit_unconfirmed', 'pending_timeout', 'result_timeout', 'quota_exhausted', 'google_blocked', 'approval_required', 'browser_busy', 'unsupported_input', 'prompt_not_found', 'existing_draft', 'settings_not_unique', 'image_model_not_verified', 'image_settings_not_unique', 'prompt_input_failed', 'submit_not_ready', 'media_download_failed', 'multiple_outputs', 'result_uncertain', 'browser_not_ready'}
                    if code not in allowed: code = 'result_uncertain'
                    stage = failure.get('stage') if failure.get('stage') in {'inspect','prepare','input','ready','submitted','waiting','download'} else 'unknown'
                    logger.info('Kisara browser account=%d request=%s code=%s stage=%s', request.account_id, request_id, code, stage)
                    if not request.recover and code in {'frames_mode_unavailable', 'frames_settings_unverified', 'start_frame_unverified', 'reference_upload_failed', 'existing_attachments', 'video_model_not_verified', 'native_input_unavailable', 'quota_exhausted', 'browser_busy', 'unsupported_input', 'prompt_not_found', 'existing_draft', 'settings_not_unique', 'image_model_not_verified', 'image_settings_not_unique', 'prompt_input_failed', 'submit_not_ready', 'browser_not_ready'}:
                        _uncertain_accounts.discard(request.account_id)
                        _save_browser_state()
                    raise HTTPException(409, code)
                media = result.get('inspection', {})
                url = media.get('mediaUrl') if isinstance(media, dict) else None
                if not isinstance(url, str) or len(url) > 56 * 1024 * 1024 or not (url.startswith(('https://', 'data:' + request.kind + '/')) or url == '/api/kisara/browser/media/' + request_id):
                    _uncertain_accounts.add(request.account_id)
                    raise HTTPException(409, 'result_uncertain')
                _uncertain_accounts.discard(request.account_id)
                _save_browser_state()
                logger.info('Kisara browser account=%d request=%s code=completed', request.account_id, request_id)
                return {'mediaUrl': url}
            except asyncio.TimeoutError:
                logger.info('Kisara browser account=%d request=%s code=worker_timeout', request.account_id, request_id)
                _uncertain_accounts.add(request.account_id)
                raise HTTPException(504, 'result_uncertain')
            finally:
                service.pending_requests.pop(request_id, None)

    @router.post('/api/kisara/browser/acknowledge')
    async def acknowledge_browser(request: BrowserInspect):
        if not _state_valid or _browser_lock.locked():
            raise HTTPException(409, 'browser_busy_or_uncertain')
        # Called only by Kisara's explicit "checked Flow" action, never by a retry loop.
        _uncertain_accounts.discard(request.account_id)
        _save_browser_state()
        return {'ok': True}

    @router.post('/api/kisara/route')
    async def pair(request: RoutePair):
        async with _lock:
            data = await snapshot()
            if not data['extensionMode']:
                raise HTTPException(409, 'Extension mode is not active')
            if not any(a['id'] == request.account_id for a in data['accounts']):
                raise HTTPException(404, 'Account not found')
            if not any(w['routeKey'] == request.route_key for w in data['workers']):
                raise HTTPException(409, 'Worker is not connected')
            if any(a['id'] != request.account_id and a['routeKey'] == request.route_key for a in data['accounts']):
                raise HTTPException(409, 'Worker is already assigned to another account')
            await manager().update_token(token_id=request.account_id, extension_route_key=request.route_key, auto_enable_on_update=False)
            return await snapshot()
    return router
