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
   video_bytes=base64.b64encode((root/'tmp/bugcheck/flow-native-video.mp4').read_bytes()).decode()
   w.evaluate("""bytes=>{globalThis.testVideoBytes=bytes;globalThis.realFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=async(input,init={})=>{const url=String(input);if(url==='https://flow.google.com/asb/kenzo-fixture'){if(init.headers?.Authorization)throw Error('Credential sent to CDN');globalThis.cdnCredentials=init.credentials;const data=Uint8Array.from(atob(globalThis.testVideoBytes),c=>c.charCodeAt(0));const r=new Response(data,{status:200});Object.defineProperty(r,'url',{value:globalThis.cdnBadHost?'https://evil.example.test/asset':'https://video.googlevideo.com/fixture.mp4'});return r;}if(url.includes('/api/kisara/browser/media/')){globalThis.localUpload={authorization:init.headers.Authorization,type:init.headers['Content-Type'],bytes:(await init.body.arrayBuffer()).byteLength};return new Response('{}',{status:200})}return globalThis.realFetch(input,init)}}""",video_bytes)
   for bad in [False,True]:
    page.goto('https://flow.google.com/project/fixture');page.wait_for_load_state('networkidle')
    page.evaluate("()=>{const video=document.createElement('video');video.src='https://flow.google.com/asb/kenzo-fixture';video.width=320;video.height=180;document.body.append(video)}")
    w.evaluate('bad=>{globalThis.cdnBadHost=bad;delete globalThis.localUpload}',bad)
    result=request('recover_video')
    if bad:
     assert result.get('errorCode')=='media_download_failed',result
     assert w.evaluate('!globalThis.localUpload')
    else:
     assert result['inspection']['mediaUrl']=='/api/kisara/browser/media/recover_video',result
     upload=w.evaluate('globalThis.localUpload')
     assert upload['type']=='video/mp4' and upload['bytes']>1000
     assert upload['authorization']=='Bearer synthetic-key'
     assert w.evaluate('globalThis.cdnCredentials')=='include'
    assert page.evaluate('window.submits||0')==0
   print('VIDEO CDN WORKER PASS: existing video downloaded via authenticated browser, valid CDN and file signature checked, API key sent only to loopback upload, unapproved CDN refused, zero generation clicks.')
  finally:c.close()
