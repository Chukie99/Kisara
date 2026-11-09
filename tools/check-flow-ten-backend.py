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
rows[0]['extension_route_key']='acct-1'
scenario='success';calls=[]
async def batch_send(self,raw):
 request=json.loads(raw);future,_=Service.pending_requests[request['req_id']]
 if request.get('action')=='recover_image':
  future.set_result({'status':'success','inspection':{'mediaUrl':'https://flow-content.google/image/recovered'}});return
 if request['type']=='inspect_flow_ui':
  future.set_result({'status':'success','inspection':{'batchVersion':0 if scenario=='old_worker' else 1}});return
 assert request['type']=='generate_image_batch';calls.append(request)
 tasks=request['tasks']
 outputs=[{'id':t['id'],'mediaUrl':'https://flow-content.google/image/'+t['id'],'submitted':True} for t in reversed(tasks)]
 if scenario=='partial':outputs[0]={'id':tasks[-1]['id'],'error':'submit_unconfirmed','submitted':True}
 if scenario=='quota':outputs=[{'id':t['id'],'error':'quota_exhausted' if i==0 else 'batch_stopped','submitted':False} for i,t in enumerate(tasks)]
 if scenario=='duplicate':outputs[-1]['id']=outputs[0]['id']
 future.set_result({'status':'success','batchResults':outputs})
Socket.send_text=batch_send
tasks=[{'id':'clip-'+str(i),'prompt':'Scene '+str(i)} for i in range(10)]
with TestClient(app) as client:
 assert client.post('/api/kisara/browser/image-batch',json={'account_id':1,'tasks':tasks}).status_code in (401,403)
 client.headers['Authorization']='Bearer '+config.api_key
 for scenario in ['success','partial','quota','duplicate','old_worker']:
  routes._uncertain_accounts.clear();calls.clear()
  r=client.post('/api/kisara/browser/image-batch',json={'account_id':1,'tasks':tasks})
  if scenario in ['duplicate','old_worker']:assert r.status_code==409,(scenario,r.text)
  else:assert r.status_code==200,(scenario,r.text)
  if scenario in ['success','quota','old_worker']:assert not routes._uncertain_accounts,(scenario,r.text)
  else:assert 1 in routes._uncertain_accounts
  assert not Service.pending_requests,(scenario,Service.pending_requests)
  assert len(calls)==(0 if scenario=='old_worker' else 1)
  print('PASS batch backend:',scenario)
 routes._uncertain_accounts.add(1)
 recovery={'batchKey':'batch_'+'a'*32,'ids':['clip-0','clip-1'],'id':'clip-0'}
 count=len(calls)
 response=client.post('/api/kisara/browser/image',json={'account_id':1,'kind':'image','recover':True,'prompt':json.dumps(recovery)})
 assert response.status_code==200,response.text
 assert response.json()['mediaUrl'].endswith('/recovered') and len(calls)==count
 assert client.post('/api/kisara/browser/image',json={'account_id':1,'kind':'image','recover':True,'prompt':'invalid'}).status_code==400
 print('PASS existing image recovery: exact batch key and known IDs required, no generation command')
 routes._uncertain_accounts.clear()
 assert client.post('/api/kisara/browser/image-batch',json={'account_id':1,'tasks':tasks+tasks[:1]}).status_code==422
 assert client.post('/api/kisara/browser/image-batch',json={'account_id':1,'tasks':[tasks[0],tasks[0]]}).status_code==400
 for key in ['fixture-a','fixture-b']:Service.pending_requests[key]=(None,None)
 for key,value in [('fixture-a',b'first'),('fixture-b',b'second')]:assert client.put('/api/kisara/browser/media/'+key,content=value,headers={'Content-Type':'image/png'}).status_code==200
 assert client.get('/api/kisara/browser/media/fixture-a').content==b'first'
 assert client.get('/api/kisara/browser/media/fixture-b').content==b'second'
 Service.pending_requests.clear()
print('BATCH BACKEND PASS: auth, ten-task cap, unique IDs, owner-linked futures, old-worker refusal before submit, quota is safe pre-submit, partial ambiguity retained, multiple downloads coexist.')
