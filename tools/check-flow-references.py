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
other_png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',512,288,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+b'\x11\x22\x44'*512)*288))+chunk(b'IEND',b'')
radio=lambda text:f'<button role="radio" aria-checked="false" onclick="for(const b of this.parentElement.children)b.setAttribute(\'aria-checked\',\'false\');this.setAttribute(\'aria-checked\',\'true\')">{text}</button>'
pane='<flow-settings-view hidden><button aria-label="Model default pembuatan gambar">Nano Banana 2.1</button>'+''.join('<mat-button-toggle-group style="display:block">'+''.join(radio(t) for t in opts)+'</mat-button-toggle-group>' for opts in [['16:9','9:16'],['x1','x2'],['16:9','9:16'],['x1','x2']])+'<button aria-label="Model default pembuatan video">Veo</button><button onclick="this.parentElement.hidden=true">Simpan</button></flow-settings-view>'
html='''<html><body><flow-image-tile><img data-media-id="11111111-1111-1111-1111-111111111111" src="https://media.example.test/old.png"></flow-image-tile><div role="textbox" contenteditable="true" aria-label="Apa yang ingin Anda buat?" oninput="document.querySelector('[aria-label=&quot;Mulai pembuatan&quot;]').disabled=false"></div><button aria-label="Setelan" onclick="document.querySelector('flow-settings-view').hidden=false">tune</button><button aria-label="Mulai pembuatan" disabled onclick="window.submits=(window.submits||0)+1;window.finish()">arrow_forward</button>'''+pane+'</body></html>'
html=html.replace('<div role="textbox"', '<section id="composer"><input type="file" accept="image/png,image/jpeg,image/webp" multiple><div role="textbox"').replace(pane,'</section>'+pane)
root=Path.cwd();ext=root/'tools/flow2api/extension';exe=Path(os.environ['LOCALAPPDATA'])/'ms-playwright/chromium-1234/chrome-win64/chrome.exe'
with tempfile.TemporaryDirectory(prefix='browser-image-') as profile:
 with sync_playwright() as p:
  c=p.chromium.launch_persistent_context(profile,executable_path=str(exe),headless=True,args=['--disable-extensions-except='+str(ext),'--load-extension='+str(ext)])
  try:
   c.route('https://flow.google.com/**',lambda r:r.fulfill(status=200,content_type='text/html',body=html))
   c.route('https://lh3.googleusercontent.com/**',lambda r:r.fulfill(status=200,content_type='image/png',body=other_png if r.request.url.endswith('existing.png') else png))
   c.route('https://media.example.test/**',lambda r:r.fulfill(status=200,content_type='image/png',body=other_png if r.request.url.endswith('existing.png') else portrait_png if globals().get('aspect',globals().get('chosen'))=='9:16' else png))
   w=c.service_workers[0] if c.service_workers else c.wait_for_event('serviceworker',timeout=15000)
   w.evaluate("async()=>await chrome.storage.local.set({apiKey:'synthetic-key',serverUrl:'ws://127.0.0.1:18774/captcha_ws',routeKey:'fixture'})")
   page=c.new_page()
   def request(action,**kw):
    asyncio.run_coroutine_threadsafe(peer['ws'].send(json.dumps({'type':'inspect_flow_ui','req_id':action,'action':action,**kw})),peer['loop']).result(3)
    for _ in range(850):
     page.wait_for_timeout(100)
     if not answers.empty():return answers.get_nowait()
    raise AssertionError('worker did not answer')
   import base64
   reference='data:image/png;base64,'+base64.b64encode(png).decode()
   for mode in ['reference','auto_model','replaced_model','missing_model','settings_open','delayed_start','delayed_save','delayed_upload_editor','library_reference','library_reuse','library_instant','library_dom','library_multi_cached','library_multi_upload','busy_then_idle','video','portrait_video','multi_thumbnail_video','old_tile_refresh_video','multiple_results_video','missing_controls_video','wrong_frame_video','changed_frame_video','upload_failure','existing_attachment','reuse_attachment','google_reference','wrong_google_reference','library_delayed_chip']:
    page.goto('https://flow.google.com/project/fixture');page.wait_for_load_state('networkidle')
    page.evaluate("""mode=>{
      document.querySelector('input[type=file]').onchange=e=>{window.uploaded=Array.from(e.target.files).map(f=>({name:f.name,type:f.type,size:f.size}));if(mode==='upload_failure')return;if(mode==='library_reference'){const file=e.target.files[0],pick=document.createElement('button'),add=document.createElement('button');pick.textContent=file.name+'Gambar';add.textContent='Tambahkan ke perintah';add.disabled=true;pick.onclick=ev=>{if(ev.isTrusted)add.disabled=false};add.onclick=ev=>{if(!ev.isTrusted)return;const img=document.createElement('img');img.src=URL.createObjectURL(file);document.querySelector('#composer').append(img);pick.remove();add.remove()};document.body.append(pick,add);return;}for(const f of e.target.files){const img=document.createElement('img');img.src=URL.createObjectURL(f);document.querySelector('#composer').append(img)}};
      if(mode==='library_reference'){const b=document.createElement('button');b.setAttribute('aria-label','Tambahkan bahan ke kotak perintah');b.textContent='add';b.onclick=()=>b.textContent='close';document.querySelector('#composer').append(b)};
      window.finish=()=>{const tile=document.createElement(mode.includes('video')?'flow-video-tile':'flow-image-tile');tile.innerHTML='<img data-media-id="22222222-2222-2222-2222-222222222222" src="https://media.example.test/result.png">'+(mode.includes('video')?'<video src="https://media.example.test/result.mp4"></video>':'');document.body.append(tile)};
      if(['existing_attachment','reuse_attachment'].includes(mode)){const img=document.createElement('img');img.src='https://media.example.test/'+(mode==='existing_attachment'?'existing':'matched')+'.png';document.querySelector('#composer').append(img)}
    }""",mode)
    if 'video' in mode:
     page.evaluate("""()=>{
       document.querySelector('flow-settings-view').remove();
       const slot=document.createElement('button');slot.id='start-frame';slot.setAttribute('aria-label','Add start frame');slot.innerHTML='<input type="file" accept="image/png">';document.querySelector('#composer').append(slot);
       slot.querySelector('input').onchange=e=>{const f=e.target.files[0];window.uploaded=[{size:f.size}];const img=new Image();img.src=URL.createObjectURL(f);slot.append(img)};
       const model=document.createElement('button');model.textContent='Veo 3.1';model.onclick=()=>document.querySelector('#video-options').hidden=!document.querySelector('#video-options').hidden;
       document.querySelector('#composer').append(model);
       const options=document.createElement('section');options.id='video-options';options.hidden=true;
       for(const values of [['16:9','9:16'],['x1','x2']]){const g=document.createElement('div');g.setAttribute('role','radiogroup');for(const value of values){const b=document.createElement('button');b.textContent=value;b.setAttribute('aria-checked','false');b.onclick=ev=>{if(!ev.isTrusted)return;for(const c of g.children)c.setAttribute('aria-checked','false');b.setAttribute('aria-checked','true')};g.append(b)}options.append(g)}document.body.append(options);
     }""")
    if mode in ['multi_thumbnail_video','old_tile_refresh_video','multiple_results_video']:
     page.evaluate("""mode=>{
      const original=window.finish;
      if(mode==='old_tile_refresh_video'){const old=document.createElement('flow-video-tile');old.innerHTML='<img src="https://media.example.test/old.png"><video src="https://media.example.test/old.mp4"></video>';document.body.append(old);window.oldVideoTile=old;}
      window.finish=()=>{original();const tile=[...document.querySelectorAll('flow-video-tile')].at(-1);
       if(mode==='multi_thumbnail_video'){const hover=tile.querySelector('img').cloneNode();hover.dataset.mediaId='33333333-3333-3333-3333-333333333333';tile.append(hover);}
       if(mode==='old_tile_refresh_video')window.oldVideoTile.querySelector('img').dataset.mediaId='44444444-4444-4444-4444-444444444444';
       if(mode==='multiple_results_video'){const second=tile.cloneNode(true);second.querySelector('img').dataset.mediaId='55555555-5555-5555-5555-555555555555';document.body.append(second);}
      };
     }""",mode)
    if mode=='missing_controls_video':page.locator('#start-frame').evaluate('(e)=>e.remove()');page.locator('#composer button').filter(has_text='Veo 3.1').evaluate('(e)=>e.remove()')
    if mode=='wrong_frame_video':page.locator('#start-frame').evaluate("e=>{const img=new Image();img.src='https://media.example.test/existing.png';e.append(img)}");page.wait_for_timeout(400)
    if mode=='changed_frame_video':page.locator('[contenteditable=true]').evaluate("e=>e.addEventListener('input',()=>document.querySelector('#start-frame img')?.remove())")
    if mode in ['auto_model','replaced_model','missing_model']:
     page.evaluate("""mode=>{const model=document.querySelector('[aria-label="Model default pembuatan gambar"]');model.textContent='Nano Banana Pro';model.onclick=()=>{const option=document.createElement('button');option.setAttribute('role',mode==='auto_model'?'option':'menuitem');option.textContent=mode==='missing_model'?'Nano Banana 2 Lite':'Nano Banana 2.1';option.onclick=()=>{window.modelSelections=(window.modelSelections||0)+1;if(mode==='replaced_model'){const copy=model.cloneNode();copy.textContent='Nano Banana 2.1';model.replaceWith(copy)}else model.textContent='Nano Banana 2.1';option.remove()};document.body.append(option)}}""",mode)
    if mode=='settings_open':
     page.evaluate("""()=>{const editor=document.querySelector('[contenteditable=true]');editor.remove();const pane=document.querySelector('flow-settings-view');pane.hidden=false;[...pane.querySelectorAll('button')].find(e=>e.textContent==='Simpan').onclick=()=>{pane.hidden=true;document.querySelector('#composer').append(editor)}}""")
    if mode=='delayed_start':page.evaluate("()=>{const editor=document.querySelector('[contenteditable=true]');editor.remove();setTimeout(()=>document.querySelector('#composer').append(editor),1800)}")
    if mode=='delayed_save':page.evaluate("()=>{const pane=document.querySelector('flow-settings-view');[...pane.querySelectorAll('button')].find(e=>e.textContent==='Simpan').onclick=()=>{pane.hidden=true;const editor=document.querySelector('[contenteditable=true]');editor.remove();setTimeout(()=>document.querySelector('#composer').append(editor),1800)}}")
    if mode=='delayed_upload_editor':page.evaluate("()=>{const input=document.querySelector('input[type=file]'),old=input.onchange;input.onchange=e=>{old(e);const editor=document.querySelector('[contenteditable=true]');editor.remove();setTimeout(()=>document.querySelector('#composer').append(editor),1800)}}")
    if mode in ['library_reuse','library_instant','library_dom']:
     import hashlib
     filename='kisara-'+hashlib.sha256(png).hexdigest()[:16]+'-reference-1.png'
     page.evaluate("""({name,instant,dom})=>{window.uploaded=[];const toggle=document.createElement('button');toggle.textContent='add';toggle.setAttribute('aria-label','Tambahkan bahan ke kotak perintah');toggle.onclick=()=>{toggle.textContent=toggle.textContent==='add'?'close':'add';if(toggle.textContent!=='close')return;const pick=document.createElement('button'),add=document.createElement('button');pick.textContent=name+'Gambar';add.textContent='Tambahkan ke perintah';add.disabled=true;pick.onclick=ev=>{if(ev.isTrusted||dom){add.disabled=false;if(instant){const img=new Image();img.src='https://media.example.test/matched.png';document.querySelector('#composer').append(img);pick.remove();add.remove();toggle.textContent='add'}}};add.onclick=ev=>{if(!ev.isTrusted)return;const img=new Image();img.src='https://media.example.test/matched.png';document.querySelector('#composer').append(img);pick.remove();add.remove();toggle.textContent='add'};document.body.append(pick,add)};document.querySelector('#composer').append(toggle)}""",{'name':filename,'instant':mode in ['library_instant','library_dom'],'dom':mode=='library_dom'})
    if mode=='library_delayed_chip':
     import hashlib
     name='kisara-'+hashlib.sha256(png).hexdigest()[:16]+'-reference-1.png'
     page.evaluate("""name=>{window.uploaded=[];const toggle=document.createElement('button');toggle.textContent='add';toggle.setAttribute('aria-label','Tambahkan bahan ke kotak perintah');toggle.onclick=()=>{toggle.textContent='close';const card=document.createElement('button');card.textContent=name+'Gambar';card.onclick=()=>{card.remove();setTimeout(()=>{const img=new Image();img.src='https://media.example.test/matched.png';document.querySelector('#composer').append(img);toggle.textContent='add'},500)};document.body.append(card)};document.querySelector('#composer').append(toggle);const unrelated=document.createElement('button');unrelated.textContent='Tambahkan ke perintah';unrelated.onclick=()=>{window.wrongConfirm=(window.wrongConfirm||0)+1;const img=new Image();img.src='https://media.example.test/existing.png';document.querySelector('#composer').append(img)};document.body.append(unrelated)}""",name)
    if mode in ['library_multi_cached','library_multi_upload']:
     import hashlib
     names=['kisara-'+hashlib.sha256(png).hexdigest()[:16]+'-reference-'+str(i)+'.png' for i in [1,2]]
     page.evaluate("""({names,cached})=>{window.uploaded=[];window.available=cached;const toggle=document.createElement('button');toggle.textContent='add';toggle.setAttribute('aria-label','Tambahkan bahan ke kotak perintah');const close=()=>{document.querySelectorAll('[data-card]').forEach(e=>e.remove());toggle.textContent='add'};toggle.onclick=()=>{if(toggle.textContent==='close'){close();return}toggle.textContent='close';if(!window.available)return;for(const name of names){const b=document.createElement('button');b.dataset.card='true';b.textContent=name+'Gambar';b.onclick=()=>{const img=new Image();img.src='https://media.example.test/matched.png';document.querySelector('#composer').append(img);close()};document.body.append(b)}};document.querySelector('#composer').append(toggle);document.querySelector('input[type=file]').onchange=e=>{window.uploaded=Array.from(e.target.files).map(f=>({size:f.size}));window.available=true}}""",{'names':names,'cached':mode=='library_multi_cached'})
    if mode=='busy_then_idle':page.evaluate("()=>{const pending=document.createElement('flow-pending-tile');pending.style.cssText='display:block;width:20px;height:20px';document.body.append(pending);setTimeout(()=>pending.remove(),1800)}")
    if mode in ['google_reference','wrong_google_reference']:
     page.evaluate("mode=>{const img=new Image();img.src='https://lh3.googleusercontent.com/'+(mode==='wrong_google_reference'?'existing':'matched')+'.png';document.querySelector('#composer').append(img)}",mode)
     page.wait_for_timeout(400)
     w.evaluate("""async()=>{const tabs=await chrome.tabs.query({url:'https://flow.google.com/project/*'});await chrome.scripting.executeScript({target:{tabId:tabs[0].id},world:'ISOLATED',func:()=>{const old=globalThis.fetch;globalThis.fetch=(url,...args)=>String(url).startsWith('https://lh3.googleusercontent.com/')?Promise.reject(new TypeError('Synthetic page CORS denial')):old(url,...args)}})}""")
    if mode in ['existing_attachment','reuse_attachment']:page.wait_for_timeout(400)
    video='video' in mode
    aspect='9:16' if mode=='portrait_video' else '16:9'
    result=request('generate_frames_video' if video else 'generate_reference_image',prompt='Kenzo saves money.',aspect=aspect,references=[reference,reference] if mode.startswith('library_multi') else [reference])
    expected={'missing_model':'image_model_not_verified','upload_failure':'reference_upload_failed','existing_attachment':'existing_attachments','multiple_results_video':'multiple_outputs','missing_controls_video':'frames_mode_unavailable','wrong_frame_video':'existing_attachments','changed_frame_video':'submit_not_ready','wrong_google_reference':'existing_attachments'}.get(mode)
    if expected:
     assert result['inspection']['failure']['code']==expected,result
     assert page.evaluate('window.submits||0')==(1 if mode=='multiple_results_video' else 0)
    else:
     assert result['inspection']['mediaUrl']=='https://media.example.test/result.'+('mp4' if video else 'png'),result
     assert page.evaluate('window.submits')==1
     if mode in ['auto_model','replaced_model']:assert page.evaluate('window.modelSelections')==1
     if mode not in ['library_delayed_chip','google_reference','reuse_attachment','library_reuse','library_instant','library_dom','library_multi_cached']:assert page.evaluate('window.uploaded[0].size')==len(png)
     if mode in ['library_reuse','library_instant','library_dom','library_multi_cached']:assert page.evaluate('window.uploaded.length')==0
     if video:
      assert page.locator('#start-frame img').count()==1
      assert page.locator('#video-options [aria-checked=true]').all_text_contents()==[aspect,'x1']
     else:
      assert page.locator('mat-button-toggle-group').nth(0).locator('[aria-checked=true]').inner_text()==aspect
      assert page.locator('mat-button-toggle-group').nth(1).locator('[aria-checked=true]').inner_text()=='x1'
    if mode=='library_delayed_chip':assert page.evaluate('window.wrongConfirm||0')==0
    if mode.startswith('library_multi'):assert page.locator('#composer img').count()==2
    print('PASS reference/video worker:',mode)
   for count in [0,1,2]:
    page.goto('https://flow.google.com/project/fixture');page.wait_for_load_state('networkidle')
    page.evaluate("count=>{window.kisaraFlowRecover=()=>{throw Error('Must not use an old collector')};for(let i=0;i<count;i++){const v=document.createElement('video');v.style.cssText='display:block;width:200px;height:200px';v.src='https://media.example.test/selected'+i+'.mp4';document.body.append(v)}}",count)
    result=request('recover_selected_video')
    if count==1:assert result['inspection']['mediaUrl']=='https://media.example.test/selected0.mp4',result
    else:assert result['inspection']['failure']['code']=='multiple_outputs',result
    assert page.evaluate('window.submits||0')==0
    print('PASS selected video recovery: players='+str(count)+', no Generate')
   print('REFERENCE + I2V PASS: actual extension, actual file attachment, image/video results distinguished, both aspects, missing attachment refuses submit. Synthetic Flow only.')
  finally:c.close()
