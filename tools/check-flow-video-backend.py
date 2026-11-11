import sys,asyncio,json,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'flow2api'))
import httpx
from fastapi import FastAPI
from src.api import kisara_routes as routes
from src.core.auth import verify_api_key_header

async def run():
 with tempfile.TemporaryDirectory() as temp:
  routes._state_file=Path(temp)/'pending.json';routes._uncertain_accounts=set();routes._state_valid=True
  active=set();started=asyncio.Event();release=asyncio.Event();peak=0
  class DB:
   async def get_all_tokens_with_stats(self):return [{'id':i,'email':str(i)+'@example.test','is_active':True,'image_enabled':True} for i in (1,2,3)]
  class Socket:
   def __init__(self,id):self.id=id
   async def send_text(self,raw):
    nonlocal peak
    request=json.loads(raw);assert request['action']=='generate_frames_video'
    assert self.id not in active;active.add(self.id);peak=max(peak,len(active))
    if len(active)==3:started.set()
    async def complete():
     await release.wait();active.remove(self.id)
     future,_=Service.pending_requests[request['req_id']]
     future.set_result({'status':'success','inspection':{'mediaUrl':'https://media.example.test/'+str(self.id)+'.mp4'}})
    asyncio.create_task(complete())
  class Worker:
   def __init__(self,id):self.route_key='acct-'+str(id);self.client_label='test';self.websocket=Socket(id)
  class Service:
   pending_requests={};active_connections=[Worker(i) for i in (1,2,3)]
   async def has_connection_for_token(self,id):return True,'acct-'+str(id)
  async def fake(cls,db=None):return Service()
  routes.ExtensionCaptchaService.get_instance=classmethod(fake)
  app=FastAPI();app.dependency_overrides[verify_api_key_header]=lambda:'synthetic'
  app.include_router(routes.create_kisara_router(lambda:DB(),lambda:None))
  async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://fixture') as client:
   async def submit(id):return await client.post('/api/kisara/browser/image',json={'account_id':id,'kind':'video','video_input_mode':'frames','prompt':'Existing subject moves once.','references':['data:image/png;base64,aW1hZ2U=']})
   tasks=[asyncio.create_task(submit(i)) for i in (1,2,3)]
   await asyncio.wait_for(started.wait(),3)
   duplicate=await submit(1);assert duplicate.status_code==409,duplicate.text
   assert len(Service.pending_requests)==3
   release.set();results=await asyncio.gather(*tasks)
   assert peak==3
   for id,result in enumerate(results,1):assert result.status_code==200 and result.json()['mediaUrl'].endswith(str(id)+'.mp4'),result.text
   assert not Service.pending_requests and not routes._uncertain_accounts
   assert (await client.get('/api/kisara/status')).json()['browserParallelVersion']==1
  print('VIDEO BACKEND PASS: three workers overlap, same-account duplicate refused before submit, request-owned results and uncertainty cleared individually. Synthetic sockets only.')
asyncio.run(run())
