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
with tempfile.TemporaryDirectory(prefix='browser-ten-') as profile:
 with sync_playwright() as p:
  c=p.chromium.launch_persistent_context(profile,executable_path=str(exe),headless=True,args=['--disable-extensions-except='+str(ext),'--load-extension='+str(ext)])
  try:
   c.route('https://flow.google.com/**',lambda r:r.fulfill(status=200,content_type='text/html',body=html))
   c.route('https://media.example.test/**',lambda r:r.fulfill(status=200,content_type='image/png',body=png))
   w=c.service_workers[0] if c.service_workers else c.wait_for_event('serviceworker',timeout=15000)
   w.evaluate("async()=>await chrome.storage.local.set({apiKey:'synthetic-key',serverUrl:'ws://127.0.0.1:18774/captcha_ws',routeKey:'fixture'})")
   page=c.new_page();page.goto('https://flow.google.com/project/fixture');page.wait_for_load_state('networkidle')
   page.evaluate(r"""()=>{
    window.tasks=[];window.active=0;window.peak=0;window.order=[];
    window.finish=()=>{
     const editor=document.querySelector('[role=textbox]'),command=editor.textContent;
     const user=document.createElement('flow-chat-bubble');user.innerHTML='<div class="user-bubble"></div>';user.querySelector('div').textContent=command;user.style.display='block';
     const agent=document.createElement('flow-chat-bubble');agent.innerHTML='<div class="agent-bubble"><flow-pending-tile style="display:block;width:20px;height:20px"></flow-pending-tile></div>';agent.style.display='block';
     document.body.append(user,agent);editor.textContent='';document.querySelector('[aria-label="Mulai pembuatan"]').disabled=true;
     const ids=[...command.matchAll(/KISARA_CLIP_clip-(\d+)/g)].map(m=>Number(m[1]));
     for(const i of ids){const section=document.createElement('section');section.innerHTML='<p>KISARA_CLIP_clip-'+i+'</p><flow-pending-tile style="display:block;width:20px;height:20px"></flow-pending-tile>';agent.querySelector('.agent-bubble').append(section);window.tasks.push({i,section});window.peak=Math.max(window.peak,++window.active)}
     agent.querySelector('.agent-bubble > flow-pending-tile').remove();
     for(const task of window.tasks)setTimeout(()=>{task.section.querySelector('flow-pending-tile').remove();const image=new Image();image.src='https://media.example.test/result-'+task.i+'.png';task.section.append(image);window.active--;window.order.push(task.i)},(10-task.i)*100);

    };
   }""")
   import time
   for _ in range(100):
    if peer.get('ws'):break
    page.wait_for_timeout(100)
   tasks=[{'id':'clip-'+str(i),'prompt':'Scene '+str(i),'aspect':'16:9','references':[]} for i in range(10)]
   asyncio.run_coroutine_threadsafe(peer['ws'].send(json.dumps({'type':'generate_image_batch','req_id':'batch-fixture','tasks':tasks})),peer['loop']).result(3)
   result=None
   for _ in range(1500):
    page.wait_for_timeout(100)
    if not answers.empty():result=answers.get_nowait();break
   assert result,result
   print('BATCH_RESPONSE',json.dumps(result))
   rows=result['batchResults'];assert len(rows)==10
   for row in rows:assert row.get('mediaUrl')=='https://media.example.test/result-'+row['id'].split('-')[-1]+'.png',row
   assert page.evaluate('window.peak')==10,page.evaluate('window.peak')
   assert page.evaluate('window.tasks.length')==10
   assert page.evaluate('window.submits')==1
   assert page.evaluate('window.order')==list(reversed(range(10)))
   page.evaluate(r"""()=>{
    const agent=document.querySelector('.agent-bubble'),images=[...agent.querySelectorAll('img')];agent.replaceChildren();
    const text=document.createElement('flow-a2ui-text');text.textContent=Array.from({length:10},(_,i)=>'KISARA_CLIP_clip-'+i).join('\n');agent.append(text);
    const gallery=document.createElement('flow-a2ui-multiple-choice');
    for(const image of images.reverse()){const i=Number(image.src.match(/result-(\d+)/)[1]),option=document.createElement('flow-a2ui-image-option');image.alt='Option '+(i+1);option.append(image);gallery.append(option)}agent.append(gallery);
   }""")
   mapped=w.evaluate("""async()=>{
    const [tab]=await chrome.tabs.query({url:'https://flow.google.com/project/*'});
    return (await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:()=>globalThis.kisaraFlowBatchImages('batch-fixture',Array.from({length:10},(_,i)=>'clip-'+i),'16:9').map(r=>({id:r.id,url:r.image.src}))}))[0].result;
   }""")
   assert len(mapped)==10
   for row in mapped:assert row['url'].endswith('result-'+row['id'].split('-')[-1]+'.png')
   recovered=w.evaluate("""async()=>{
    const [tab]=await chrome.tabs.query({url:'https://flow.google.com/project/*'});
    return (await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:async()=>await globalThis.kisaraFlowUI({action:'recover_image',aspect:'16:9',prompt:JSON.stringify({batchKey:'batch-fixture',ids:Array.from({length:10},(_,i)=>'clip-'+i),id:'clip-3'})})}))[0].result;
   }""")
   assert recovered.get('mediaUrl')=='https://media.example.test/result-3.png',recovered
   assert page.evaluate('window.submits')==1
   page.evaluate("""()=>{
    const gallery=document.querySelector('flow-a2ui-multiple-choice'),rest=[...gallery.children].slice(6);for(const e of rest)e.remove();
    const button=document.createElement('button');button.textContent='Lihat semua';button.onclick=()=>{for(const e of rest)gallery.append(e);button.remove()};gallery.after(button);
   }""")
   expanded=w.evaluate("""async()=>{
    const [tab]=await chrome.tabs.query({url:'https://flow.google.com/project/*'});
    return (await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:()=>{
      const ids=Array.from({length:10},(_,i)=>'clip-'+i);globalThis.kisaraFlowBatchImages('batch-fixture',ids,'16:9',true);
      return globalThis.kisaraFlowBatchImages('batch-fixture',ids,'16:9').length;
    }}))[0].result;
   }""")
   assert expanded==10 and page.evaluate('window.submits')==1
   print('COLLAPSED GALLERY PASS: View all expands six thumbnails to ten; no Generate.')
   page.evaluate("document.querySelector('flow-a2ui-text').textContent+=' KISARA_CLIP_clip-0'")
   invalid=w.evaluate("""async()=>{
    const [tab]=await chrome.tabs.query({url:'https://flow.google.com/project/*'});
    return (await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:()=>globalThis.kisaraFlowBatchImages('batch-fixture',Array.from({length:10},(_,i)=>'clip-'+i),'16:9').length}))[0].result;
   }""")
   assert invalid==0,invalid
   print('NUMBERED GALLERY PASS: reversed DOM order uses explicit Option numbers and unique labels; duplicate labels rejected; existing clip recovered without Generate.')
   page.screenshot(path=str(root/'tmp/bugcheck/flow-ten-parallel.png'),full_page=True)
   print('TEN PARALLEL PASS: one pasted command with ten scene prompts, peak=10, reverse completion, every result paired to its own clip, exactly one submit. Synthetic Chrome UI only.')
  finally:c.close()
