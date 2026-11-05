"""Interactive managed Flow browser. Secrets arrive on stdin, never arguments or files."""
import sys,json,time,os,tomllib,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

def report(status,message):
 print(json.dumps({'status':status,'message':message}),flush=True)

def request(base,path,data=None,token=None):
 headers={'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 req=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers=headers)
 with urllib.request.urlopen(req,timeout=20) as response:return json.load(response)

def find_key(v,key):
 if key in v:return v[key]
 for value in v.values():
  if isinstance(value,dict):
   result=find_key(value,key)
   if result is not None:return result

def main():
 cfg=json.loads(sys.stdin.readline())
 base=cfg['base'];root=Path(cfg['root']);profile=Path(cfg['profile']);ext=Path(cfg['extension'])
 with open(root/'tools/flow2api/config/setting.toml','rb') as f:local=tomllib.load(f)
 username=find_key(local,'admin_username') or find_key(local,'username')
 password=find_key(local,'admin_password') or find_key(local,'password')
 auth=request(base,'/api/admin/login',{'username':username,'password':password})
 try:plugin=request(base,'/api/plugin/config',token=auth['token'])['config']
 finally:
  try:request(base,'/api/admin/logout',{},auth['token'])
  except Exception:pass
 if not plugin.get('connection_token'):raise RuntimeError('Plugin belum dikonfigurasi')
 chromium=sorted((Path(os.environ['LOCALAPPDATA'])/'ms-playwright').glob('chromium-*/chrome-win64/chrome.exe'),key=lambda p:int(p.parents[1].name.split('-')[-1]),reverse=True)
 if not chromium:raise RuntimeError('Browser pendukung belum tersedia')
 with sync_playwright() as pw:
  context=pw.chromium.launch_persistent_context(str(profile),executable_path=str(chromium[0]),headless=False,args=['--disable-extensions-except='+str(ext),'--load-extension='+str(ext)])
  worker=context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker',timeout=15000)
  worker.evaluate('''async c=>{await chrome.storage.local.set({serverUrl:c.ws,apiKey:c.key,routeKey:c.route,clientLabel:c.email,uiLanguage:'id'});await globalThis.kisaraConfigure({apiUrl:c.base+'/api/plugin/update-token',connectionToken:c.connection,loginAccount:c.email,refreshInterval:60})}''',{'ws':base.replace('http://','ws://')+'/captcha_ws','key':cfg['key'],'route':cfg['routeKey'],'email':cfg['email'],'base':base,'connection':plugin['connection_token']})
  page=context.pages[0] if context.pages else context.new_page()
  page.goto('https://flow.google.com/projects',wait_until='domcontentloaded',timeout=60000)
  report('login','Browser siap. Login Google dengan email '+cfg['email']+'. Kunci koneksi sudah diisi otomatis.')
  paired=False;last_identity='';next_sync=0
  while context.pages:
   page=context.pages[0]
   try:
    if not paired:
     identity=worker.evaluate('''async()=>{for(const url of ['https://flow.google.com/auth/session','https://labs.google/fx/api/auth/session']){try{const r=await fetch(url,{credentials:'include'});if(r.ok){const j=await r.json();if(j.user?.email)return j.user.email}}catch{}}return ''}''')
     if identity and identity.lower()!=cfg['email'].lower():
      if identity!=last_identity:report('login','Akun Google yang login berbeda. Gunakan email '+cfg['email']+' pada browser ini.')
     elif identity and time.monotonic()>=next_sync:
      next_sync=time.monotonic()+30
      result=worker.evaluate('async()=>await globalThis.kisaraSync()')
      if result.get('success'):
       setup=request(base,'/api/kisara/status',token=cfg['key'])
       account=next((a for a in setup['accounts'] if a['email'].lower()==cfg['email'].lower()),None)
       if account:
        request(base,'/api/kisara/route',{'account_id':account['id'],'route_key':cfg['routeKey']},cfg['key']);paired=True;report('ready','Akun tersambung dan dipasangkan otomatis. Browser ini perlu tetap terbuka saat membuat gambar.')
     last_identity=identity
    page.wait_for_timeout(5000)
   except Exception:
    if not context.pages:break
    report('login' if not paired else 'ready','Menunggu koneksi browser dan server. Pastikan browser tetap terbuka.');time.sleep(5)
  context.close()
 report('closed','Browser akun ditutup. Buka lagi dari Kisara ketika diperlukan.')

if __name__=='__main__':
 try:main()
 except Exception:report('error','Browser akun belum berhasil dibuka. Pastikan browser profil ini tidak sedang dibuka di tempat lain dan server Flow siap.');sys.exit(1)
