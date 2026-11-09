import asyncio,json,threading,os,tempfile,queue,zlib,struct,subprocess
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
root=Path.cwd();video_file=root/'tmp/bugcheck/canvas-input.mp4';video_file.parent.mkdir(parents=True,exist_ok=True);subprocess.run([str(root/'node_modules/ffmpeg-static/ffmpeg.exe'),'-y','-v','error','-f','lavfi','-i','color=c=blue:s=256x144:r=24','-t','0.5','-an','-c:v','libx264',str(video_file)],check=True);ext=root/'tools/flow2api/extension';exe=Path(os.environ['LOCALAPPDATA'])/'ms-playwright/chromium-1234/chrome-win64/chrome.exe'
with tempfile.TemporaryDirectory(prefix='browser-image-') as profile:
 with sync_playwright() as p:
  c=p.chromium.launch_persistent_context(profile,executable_path=str(exe),headless=True,args=['--disable-extensions-except='+str(ext),'--load-extension='+str(ext)])
  try:
   c.route('https://flow.google.com/**',lambda r:r.fulfill(status=200,content_type='text/html',body=html))
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
   download_dir=root/'tmp/bugcheck/canvas-download-fixture';download_dir.mkdir(exist_ok=True)
   c.new_cdp_session(page).send('Browser.setDownloadBehavior',{'behavior':'allow','downloadPath':str(download_dir)})
   page.goto('https://flow.google.com/project/fixture');page.wait_for_load_state('networkidle')
   data=base64.b64encode(video_file.read_bytes()).decode()
   canvas_setup="""data=>{const canvas=document.createElement('flow-scene-editor-canvas');canvas.style.cssText='display:block;width:200px;height:200px';document.body.append(canvas);const download=document.createElement('button');download.setAttribute('aria-label','Download media');download.textContent='download';download.onclick=()=>{const original=document.createElement('button');original.textContent='720p Ukuran asli';original.onclick=()=>{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'})),a=document.createElement('a');a.href=url;a.download='kisara-recovery-fixture.mp4';a.click();original.remove()};document.body.append(original)};document.body.append(download)}"""
   page.evaluate(canvas_setup,data)
   result=request('recover_selected_video')
   print('DOWNLOAD DIAGNOSTIC',w.evaluate("async()=> (await chrome.downloads.search({limit:3,orderBy:['-startTime']})).map(i=>({filename:i.filename,size:i.fileSize,state:i.state,mime:i.mime,scheme:i.url.split(':')[0]}))"))
   assert result['status']=='success',result
   assert result['inspection']['downloadFile']['size']==video_file.stat().st_size,result
   assert page.evaluate('window.submits||0')==0
   print('CANVAS RECOVERY PASS: real Chrome download event, completed MP4, zero Generate.')
   page.goto('https://flow.google.com/project/fixture');page.wait_for_load_state('networkidle')
   deferred=canvas_setup.replace('data=>{const canvas=', 'data=>{window.installCanvas=()=>{const canvas=').replace('document.body.append(download)}', 'document.body.append(download)}}')
   page.evaluate(deferred,data)
   page.evaluate("""()=>{document.querySelector('input[type=file]').onchange=e=>{for(const f of e.target.files){const img=new Image();img.src=URL.createObjectURL(f);document.querySelector('#composer').append(img)}};window.finish=()=>{const tile=document.createElement('flow-video-tile');tile.innerHTML='<img data-media-id="22222222-2222-2222-2222-222222222222" src="https://media.example.test/result.png">';tile.onclick=()=>window.installCanvas();document.body.append(tile)}}""")
   result=request('generate_video',prompt='Animate the existing subject.',aspect='16:9',references=[reference])
   assert result['status']=='success',result
   assert result['inspection']['downloadFile']['size']==video_file.stat().st_size,result
   assert page.evaluate('window.submits||0')==1
   print('CANVAS GENERATION PASS: new result selected, original MP4 downloaded, exactly one Generate.')

  finally:c.close()
