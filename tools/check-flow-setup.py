import sys,asyncio,tempfile,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'flow2api'))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.api.kisara_routes import create_kisara_router,ExtensionCaptchaService
from src.core.config import config
from src.api import kisara_routes as routes
state_temp=tempfile.TemporaryDirectory()
routes._state_file=Path(state_temp.name)/'pending.json'
routes._uncertain_accounts=set()
routes._state_valid=True
mode='inspect'
rows=[{'id':1,'email':'one@example.test','is_active':True,'extension_route_key':'','image_enabled':True,'st':'private-cookie'}, {'id':2,'email':'two@example.test','is_active':False,'extension_route_key':'acct-2','image_enabled':True}]
class DB:
 async def get_all_tokens_with_stats(self):return rows
class Manager:
 async def update_token(self,**kw):
  assert kw['auto_enable_on_update'] is False
  next(r for r in rows if r['id']==kw['token_id'])['extension_route_key']=kw['extension_route_key']
class Socket:
 async def send_text(self, raw):
  import json
  request=json.loads(raw)
  assert request['type']=='inspect_flow_ui'
  future,_=Service.pending_requests[request['req_id']]
  if request.get('action') in ('generate_image','generate_reference_image','generate_video','generate_frames_video','recover_video'):
   if request['action'] in ('generate_video','generate_frames_video','recover_video'):
    if request['action'] in ('generate_video','generate_frames_video'):assert len(request['references'])==1
    future.set_result({'status':'success','inspection':{'mediaUrl':'https://media.example.test/scene.mp4'}})
    return
   future.set_result({'status':'success','inspection':{'failure':{'code':mode,'stage':'ready','submitted':False}}} if mode=='submit_not_ready' else {'status':'success','inspection':{'failure':{'code':mode,'stage':'submitted','submitted':True}}} if mode=='submit_unconfirmed' else {'status':'success','inspection':{'preSubmitError':mode}} if mode=='quota_exhausted' else {'status':'error','errorCode':mode} if mode!='success' else {'status':'success','inspection':{'mediaUrl':'data:image/png;base64,fixture'}})
   return
  future.set_result({'status':'success','inspection':{'host':'flow.google.com','projectOpen':True,'blocked':False,'fields':[{'tag':'textarea','value':'private-editor-value'}],'buttons':[{'label':'Generate','cookie':'private-session'}]}})
class Worker:
 route_key='acct-1';client_label='Profile 1';websocket=Socket()
class Service:
 pending_requests={}
 active_connections=[Worker()]
 async def has_connection_for_token(self,id):
  route=next(r for r in rows if r['id']==id)['extension_route_key'];return route=='acct-1',route
async def fake(cls,db=None):return Service()
ExtensionCaptchaService.get_instance=classmethod(fake)
app=FastAPI();app.include_router(create_kisara_router(lambda:DB(),lambda:Manager()))
with TestClient(app) as client:
 assert client.get('/api/kisara/status').status_code in (401,403)
 client.headers['Authorization']='Bearer '+config.api_key
 r=client.get('/api/kisara/status');assert r.status_code==200;assert 'private-cookie' not in r.text;assert not r.json()['accounts'][0]['workerConnected']
 assert client.post('/api/kisara/route',json={'account_id':1,'route_key':'missing'}).status_code==409
 assert client.post('/api/kisara/route',json={'account_id':1,'route_key':'../../bad'}).status_code==422
 r=client.post('/api/kisara/route',json={'account_id':1,'route_key':'acct-1'});assert r.status_code==200;assert r.json()['accounts'][0]['workerConnected']
 assert client.post('/api/kisara/route',json={'account_id':2,'route_key':'acct-1'}).status_code==409
 assert client.post('/api/kisara/route',json={'account_id':99,'route_key':'acct-1'}).status_code==404
 r=client.post('/api/kisara/browser/inspect',json={'account_id':1});assert r.status_code==200,r.text
 assert r.json()['projectOpen'];assert 'private-editor-value' not in r.text;assert 'private-session' not in r.text
 assert not Service.pending_requests
 assert client.post('/api/kisara/browser/inspect',json={'account_id':99}).status_code==409
 assert rows[1]['is_active'] is False
 mode='existing_draft'
 r=client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'fixture'});assert r.status_code==409;assert not routes._uncertain_accounts
 mode='quota_exhausted'
 r=client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'fixture'});assert r.status_code==409 and r.json()['detail']=='quota_exhausted';assert not routes._uncertain_accounts
 mode='submit_not_ready'
 r=client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'fixture'});assert r.status_code==409 and r.json()['detail']=='submit_not_ready';assert not routes._uncertain_accounts
 mode='submit_unconfirmed'
 r=client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'fixture'});assert r.status_code==409 and r.json()['detail']=='submit_unconfirmed';assert routes._uncertain_accounts=={1}
 assert client.post('/api/kisara/browser/acknowledge',json={'account_id':1}).status_code==200
 mode='google_blocked'
 r=client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'fixture'});assert r.status_code==409;assert routes._uncertain_accounts=={1}
 assert json.loads(routes._state_file.read_text())==[1]
 assert client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'fixture'}).status_code==409
 assert client.post('/api/kisara/browser/acknowledge',json={'account_id':1}).status_code==200
 mode='success'
 assert client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'fixture'}).status_code==200
 assert not routes._uncertain_accounts;assert not Service.pending_requests
 assert client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'fixture','aspect':'9:16'}).status_code==200
 assert client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'fixture','aspect':'1:1'}).status_code==422

print('FLOW SETUP API PASS: auth, sanitized account data, missing/duplicate/invalid routes rejected, explicit pairing succeeds without enabling accounts.')

with TestClient(app) as client:
 client.headers['Authorization']='Bearer '+config.api_key
 routes._uncertain_accounts.clear()
 r=client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'Animate Kenzo','kind':'video','references':['data:image/png;base64,aGVsbG8=']})
 assert r.status_code==200,r.text
 assert r.json()['mediaUrl'].endswith('.mp4')
 r=client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'Animate frame','kind':'video','video_input_mode':'frames','references':['data:image/png;base64,aGVsbG8=']})
 assert r.status_code==200,r.text
 assert client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'Video','kind':'video'}).status_code==400
 assert client.post('/api/kisara/browser/image',json={'account_id':1,'prompt':'Image','references':['https://evil.test/x']}).status_code==400
 assert client.put('/api/kisara/browser/media/expired',content=b'abc',headers={'Content-Type':'video/mp4'}).status_code==409
 Service.pending_requests['fixture-media']=(None,None)
 assert client.put('/api/kisara/browser/media/fixture-media',content=b'video-fixture',headers={'Content-Type':'video/mp4'}).status_code==200
 r=client.get('/api/kisara/browser/media/fixture-media');assert r.content==b'video-fixture'
 assert client.get('/api/kisara/browser/media/fixture-media').status_code==404
 Service.pending_requests.clear()
 print('VIDEO ROUTE PASS: first frame required, references validated, authenticated media upload and one-time download.')

with TestClient(app) as client:
 client.headers['Authorization']='Bearer '+config.api_key
 routes._uncertain_accounts.add(1)
 r=client.post('/api/kisara/browser/image',json={'account_id':1,'kind':'video','recover':True,'prompt':'Recover existing video'})
 assert r.status_code==200,r.text
 assert r.json()['mediaUrl'].endswith('.mp4')
 assert not routes._uncertain_accounts
 assert client.post('/api/kisara/browser/image',json={'account_id':1,'kind':'image','recover':True,'prompt':'Invalid recovery'}).status_code==400
 print('VIDEO RECOVERY PASS: existing video recovered while uncertain, without sending a new generation.')
