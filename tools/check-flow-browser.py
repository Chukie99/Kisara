import asyncio,json,threading,os,tempfile,queue,zlib,struct
from pathlib import Path
import websockets
from playwright.sync_api import sync_playwright
ready=threading.Event();answers=queue.Queue();peer={}
async def handler(ws):
 peer['ws']=ws
 async for raw in ws:
  v=json.loads(raw)
  if v.get('type')=='register':await ws.send(json.dumps({'type':'register_ack','route_key':v.get('route_key')}))
  elif v.get('req_id'):answers.put(v)
async def server():
 peer['loop']=asyncio.get_running_loop()
 async with websockets.serve(handler,'127.0.0.1',18774):ready.set();await asyncio.Future()
threading.Thread(target=lambda:asyncio.run(server()),daemon=True).start();assert ready.wait(5)
def chunk(t,b):return struct.pack('!I',len(b))+t+b+struct.pack('!I',zlib.crc32(t+b)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',512,288,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+b'\x88\xaa\xbb'*512)*288))+chunk(b'IEND',b'')
portrait_png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',288,512,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+b'\x88\xaa\xbb'*288)*512))+chunk(b'IEND',b'')
radio=lambda text:f'<button role="radio" aria-checked="false" onclick="for(const b of this.parentElement.children)b.setAttribute(\'aria-checked\',\'false\');this.setAttribute(\'aria-checked\',\'true\')">{text}</button>'
pane='<flow-settings-view hidden><button aria-label="Model default pembuatan gambar">Nano Banana 2.1</button>'+''.join('<mat-button-toggle-group style="display:block">'+''.join(radio(t) for t in opts)+'</mat-button-toggle-group>' for opts in [['16:9','9:16'],['x1','x2'],['16:9','9:16'],['x1','x2']])+'<button aria-label="Model default pembuatan video">Veo</button><button onclick="this.parentElement.hidden=true">Simpan</button></flow-settings-view>'
html='''<html><body><flow-image-tile><img data-media-id="11111111-1111-1111-1111-111111111111" src="https://media.example.test/old.png"></flow-image-tile><div role="textbox" contenteditable="true" aria-label="Apa yang ingin Anda buat?" oninput="document.querySelector('[aria-label=&quot;Mulai pembuatan&quot;]').disabled=false"></div><button aria-label="Setelan" onclick="document.querySelector('flow-settings-view').hidden=false">tune</button><button aria-label="Mulai pembuatan" disabled onclick="window.submits=(window.submits||0)+1;window.finish()">arrow_forward</button>'''+pane+'</body></html>'
root=Path.cwd();ext=root/'tools/flow2api/extension';exe=Path(os.environ['LOCALAPPDATA'])/'ms-playwright/chromium-1234/chrome-win64/chrome.exe'
with tempfile.TemporaryDirectory(prefix='browser-image-') as profile:
 with sync_playwright() as p:
  c=p.chromium.launch_persistent_context(profile,executable_path=str(exe),headless=True,args=['--disable-extensions-except='+str(ext),'--load-extension='+str(ext)])
  try:
   c.route('https://flow.google.com/**',lambda r:r.fulfill(status=200,content_type='text/html',body=html))
   c.route('https://media.example.test/**',lambda r:r.fulfill(status=200,content_type='image/png',body=portrait_png if globals().get('aspect',globals().get('chosen'))=='9:16' else png))
   w=c.service_workers[0] if c.service_workers else c.wait_for_event('serviceworker',timeout=15000)
   w.evaluate("async()=>await chrome.storage.local.set({apiKey:'synthetic-key',serverUrl:'ws://127.0.0.1:18774/captcha_ws',routeKey:'fixture'})")
   page=c.new_page()
   def request(action,**kw):
    asyncio.run_coroutine_threadsafe(peer['ws'].send(json.dumps({'type':'inspect_flow_ui','req_id':action,'action':action,**kw})),peer['loop']).result(3)
    for _ in range(400):
     page.wait_for_timeout(100)
     if not answers.empty():return answers.get_nowait()
    raise AssertionError('worker did not answer')
   for mode in ['success','portrait','trusted_click','pointer_sequence','gate','blocked','draft','multiple','quota','quota_blocked','delayed_enable','replaced_editor','replaced_submit','matching_draft','hidden_pending','aria_disabled','submit_no_effect','native_attach_failure','native_release_failure','chat_blocked','chat_blocked_before','hidden_chat_block','prompt_mentions_block','quota_id_banner','quota_en_banner','hidden_credit_banner','prompt_quota_text','quota_ready_banner','quota_banner_blocked']:
    page.goto('https://flow.google.com/project/fixture');page.wait_for_load_state('networkidle')
    page.evaluate('''mode=>{window.finish=()=>{if(mode==='gate'){document.body.insertAdjacentHTML('beforeend','<flow-permission-message><div role="radio" class="option-row">Approve paid generation</div></flow-permission-message>');return;}if(mode==='chat_blocked'){document.body.insertAdjacentHTML('beforeend','<flow-chat-error-card><div class=chat-error-card><div class=error-text>Kami mendapati aktivitas yang tidak biasa. Perhatikan bahwa ekstensi browser yang mengubah halaman dapat menyebabkan masalah.</div><button>Coba lagi</button></div></flow-chat-error-card>');return;}if(mode==='blocked'){document.body.insertAdjacentHTML('beforeend','<div role="alert">We noticed some unusual activity</div>');return;}for(let i=0;i<(mode==='multiple'?2:1);i++){const tile=document.createElement('flow-image-tile');tile.innerHTML='<img data-media-id="22222222-2222-2222-2222-22222222222'+i+'" src="https://media.example.test/new'+i+'.png">';document.body.append(tile)}}}''',mode)
    page.evaluate("()=>{const g=document.querySelectorAll('mat-button-toggle-group');g[1].querySelectorAll('button')[1].click();g[3].querySelectorAll('button')[1].click()}")
    if mode in ['trusted_click','pointer_sequence']:
     page.evaluate("mode=>{const b=document.querySelector('[aria-label=\"Mulai pembuatan\"]');b.onmousedown=e=>{window.nativeDown=e.isTrusted};b.onclick=e=>{window.lastTrusted=e.isTrusted;if(!e.isTrusted||mode==='pointer_sequence'&&!window.nativeDown)return;window.submits=(window.submits||0)+1;window.finish()}}",mode)
    if mode in ['trusted_click','pointer_sequence']:
     page.evaluate("()=>{const b=document.querySelector('[aria-label=\"Mulai pembuatan\"]');b.disabled=false;b.click();b.disabled=true}")
     assert page.evaluate('window.lastTrusted===false && !window.submits')
    if mode=='chat_blocked_before':page.evaluate("document.body.insertAdjacentHTML('beforeend','<flow-chat-error-card>Kami mendapati aktivitas yang tidak biasa.</flow-chat-error-card>')")
    if mode=='hidden_chat_block':page.evaluate("document.body.insertAdjacentHTML('beforeend','<flow-chat-error-card hidden>Kami mendapati aktivitas yang tidak biasa.</flow-chat-error-card>')")
    if mode=='prompt_mentions_block':page.evaluate("document.body.insertAdjacentHTML('beforeend','<div class=user-message>Kami mendapati aktivitas yang tidak biasa.</div>')")
    if mode in ['quota_id_banner','hidden_credit_banner','quota_banner_blocked']:
     page.evaluate("hidden=>{const b=document.createElement('flow-credit-banner');b.hidden=hidden;b.innerHTML='<div class=credit-banner-error><span>Kredit Google Flow Anda habis. Anda dapat menunggu hingga kredit direset atau upgrade.</span></div>';document.body.append(b)}",mode=='hidden_credit_banner')
    if mode=='quota_en_banner':page.evaluate("()=>{const b=document.createElement('flow-credit-banner');b.textContent=String.fromCharCode(89,111,117,39,118,101)+' run out of Google Flow credits.';document.body.append(b)}")
    if mode=='quota_banner_blocked':page.evaluate("document.body.insertAdjacentHTML('beforeend','<flow-chat-error-card>Kami mendapati aktivitas yang tidak biasa.</flow-chat-error-card>')")
    if mode=='prompt_quota_text':page.evaluate("document.body.insertAdjacentHTML('beforeend','<div class=user-message>Kredit Google Flow Anda habis.</div>')")
    if mode=='quota_ready_banner':page.evaluate("()=>{document.querySelector('[role=textbox]').addEventListener('input',()=>document.body.insertAdjacentHTML('beforeend','<flow-credit-banner>Kredit Google Flow Anda habis.</flow-credit-banner>'),{once:true})}")
    if mode=='submit_no_effect':page.evaluate('window.finish=()=>{}')
    if mode in ['delayed_enable','aria_disabled']:
     page.evaluate("mode=>{const box=document.querySelector('[role=textbox]');box.oninput=()=>{const button=document.querySelector('[aria-label=\"Mulai pembuatan\"]');button.disabled=false;button.setAttribute('aria-disabled','true');if(mode==='delayed_enable')setTimeout(()=>button.setAttribute('aria-disabled','false'),1800)}}",mode)
    if mode=='replaced_submit':page.evaluate("()=>{document.querySelector('[role=textbox]').addEventListener('input',()=>{const b=document.querySelector('[aria-label=\"Mulai pembuatan\"]');b.outerHTML=b.outerHTML;document.querySelector('[aria-label=\"Mulai pembuatan\"]').disabled=false;},{once:true})}")
    if mode=='replaced_editor':page.evaluate("()=>{const save=[...document.querySelectorAll('button')].find(b=>b.textContent==='Simpan');save.addEventListener('click',()=>{const e=document.querySelector('[role=textbox]');e.outerHTML=e.outerHTML})}")
    if mode=='matching_draft':page.get_by_role('textbox').fill('Buat tepat satu gambar statis landscape 16:9 dengan Nano Banana 2.1. Hanya satu gambar, jangan buat video.\n\nSynthetic image')
    if mode=='hidden_pending':page.evaluate("document.body.insertAdjacentHTML('beforeend','<flow-pending-tile hidden></flow-pending-tile>')")
    if mode=='draft':page.get_by_role('textbox').fill('Existing user draft')
    if mode in ['quota','quota_blocked']:page.evaluate("document.body.insertAdjacentHTML('beforeend','<div role=alert>Insufficient credits</div>')")
    if mode=='quota_blocked':page.evaluate("document.body.insertAdjacentHTML('beforeend','<div role=alert>Unusual activity</div>')")
    chosen='9:16' if mode=='portrait' else '16:9'
    if mode=='native_attach_failure':w.evaluate('async()=>{const [t]=await chrome.tabs.query({url:"https://flow.google.com/project/*"});await chrome.debugger.attach({tabId:t.id},"1.3")}')
    if mode=='native_release_failure':w.evaluate('()=>{globalThis.originalSend=chrome.debugger.sendCommand.bind(chrome.debugger);chrome.debugger.sendCommand=async(...args)=>{const result=await globalThis.originalSend(...args);if(args[2]?.type==="mouseReleased")throw Error("Synthetic post-release failure");return result}}')
    try:result=request('generate_image',prompt='Synthetic image',aspect=chosen)
    finally:
     if mode=='native_attach_failure':w.evaluate('async()=>{const [t]=await chrome.tabs.query({url:"https://flow.google.com/project/*"});await chrome.debugger.detach({tabId:t.id})}')
     if mode=='native_release_failure':w.evaluate('()=>{chrome.debugger.sendCommand=globalThis.originalSend;delete globalThis.originalSend}')
    if mode in ['success','portrait','trusted_click','pointer_sequence','delayed_enable','replaced_editor','replaced_submit','matching_draft','hidden_pending','hidden_chat_block','prompt_mentions_block','hidden_credit_banner','prompt_quota_text']:
     assert result['status']=='success',result
     assert result.get('inspection',{}).get('mediaUrl')=='https://media.example.test/new0.png',(mode,result)
     assert page.evaluate('window.submits')==1
     if mode in ['trusted_click','pointer_sequence']:assert page.evaluate('window.lastTrusted===true && window.nativeDown===true')
     assert page.locator('mat-button-toggle-group').nth(0).locator('[aria-checked=true]').inner_text()==chosen
     assert page.locator('mat-button-toggle-group').nth(1).locator('[aria-checked=true]').inner_text()=='x1'
     assert chosen in page.get_by_role('textbox').inner_text()
     assert page.locator('mat-button-toggle-group').nth(3).locator('[aria-checked=true]').inner_text()=='x2'
     page.screenshot(path=str(root/'tmp/bugcheck/browser-generate-synthetic.png'))
    else:
     expected={'quota_id_banner':'quota_exhausted','quota_en_banner':'quota_exhausted','quota_ready_banner':'quota_exhausted','quota_banner_blocked':'google_blocked','chat_blocked':'google_blocked','chat_blocked_before':'google_blocked','gate':'approval_required','blocked':'google_blocked','draft':'existing_draft','multiple':'multiple_outputs','quota':'quota_exhausted','quota_blocked':'google_blocked','aria_disabled':'submit_not_ready','submit_no_effect':'submit_unconfirmed','native_attach_failure':'native_input_unavailable','native_release_failure':'submit_unconfirmed'}[mode]
     if mode in ['quota','quota_id_banner','quota_en_banner','quota_ready_banner']:assert result.get('inspection',{}).get('preSubmitError')==expected,result
     else:
      failure=result.get('inspection',{}).get('failure',{})
      assert failure.get('code')==expected,result
      if mode=='aria_disabled':assert failure['stage']=='ready' and failure['submitted'] is False,result
      if mode=='submit_no_effect':assert failure['stage']=='submitted' and failure['submitted'] is True,result
     assert page.evaluate('window.submits||0')==(0 if mode in ['draft','quota','quota_blocked','aria_disabled','native_attach_failure','chat_blocked_before','quota_id_banner','quota_en_banner','quota_ready_banner','quota_banner_blocked'] else 1)
   page.goto('https://flow.google.com/project/fixture');page.wait_for_load_state('networkidle')
   legacy=page.evaluate('async()=>{globalThis.legacyResult=await window.eval('+json.dumps((root/'tools/flow2api/extension/browser-ui.js').read_text())+');return await globalThis.kisaraFlowUI({action:"generate_image",prompt:"Synthetic image",aspect:"16:9"})}')
   assert legacy['failure']['code']=='native_input_unavailable',legacy
   assert page.evaluate('window.submits||0')==0
   assert w.evaluate('async()=>{const [tab]=await chrome.tabs.query({url:"https://flow.google.com/project/*"});await chrome.debugger.attach({tabId:tab.id},"1.3");await chrome.debugger.detach({tabId:tab.id});return true}')
   print('CREDIT BANNER PASS: Indonesian and English exhausted-credit banners classified before submit; late preparation checked; hidden cards and user text ignored; security block takes priority.')
   print('CHAT BLOCK PASS: visible Indonesian chat error classified google_blocked before/during submit; no retry; hidden card and user text do not trigger a block.')
   print('NATIVE FAULT PASS: attach refusal sends nothing; post-release failure never repeats click; sessions cleaned up.')
   print('NATIVE INPUT PASS: trusted mouse click and pointer sequence accepted, one submit each; debugger released after use.')
   print('SUBMIT REGRESSION PASS: aria-disabled never clicked; delayed enable waited; replaced editor/button handled; ineffective click reported once without retry.')
   print('BROWSER IMAGE PASS: one submit, image-only controls, existing asset excluded, new media identified, draft preserved, Google rejection/approval/extra outputs stop without retries. Synthetic page only.')
  finally:c.close()
