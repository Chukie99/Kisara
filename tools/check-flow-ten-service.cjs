const {build}=require('esbuild'), assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'), path=require('node:path'), http=require('node:http');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kisara-router-integration-'));
 global.flowFixture={temp,key:'synthetic-key',settings:{flowImageTransport:'browser',flowBrowserAccountId:0}};
 await build({entryPoints:['src/main/services/flow2api.ts'],bundle:true,platform:'node',format:'cjs',outfile:'tmp/bugcheck/router-client.cjs',plugins:[{name:'isolated-settings',setup(b){b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'electron-fixture'}));b.onLoad({filter:/.*/,namespace:'electron-fixture'},()=>({loader:'js',contents:"export const app={getPath:()=>globalThis.flowFixture?.temp||globalThis.routerFixture?.temp}"}));b.onResolve({filter:/^\.\.\/(settings|secrets|paths)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.endsWith('paths')?'export const dataDir=()=>global.flowFixture.temp':a.path.endsWith('secrets')?'export const requireSecret=()=>global.flowFixture.key':'export const getSettings=()=>global.flowFixture.settings'}))}}]});
 const f=require(path.resolve('tmp/bugcheck/router-client.cjs'));

 let scenario='success',calls=[];
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;res.setHeader('Content-Type','application/json');
  if(req.url==='/api/kisara/status')return res.end(JSON.stringify({browserBatchVersion:1,extensionMode:true,workers:[],accounts:[1,2,3].map(id=>({id,email:id+'@example.test',routeKey:'account-'+id,workerConnected:true,active:true,imageEnabled:true}))}));
  if(req.url==='/api/kisara/browser/inspect'){const value={host:'flow.google.com',projectOpen:true,blocked:false,composer:{editors:1,draftLength:0,submitCount:1,submitDisabled:true,busy:false,online:true},fields:[],buttons:[],options:[]};const account=JSON.parse(raw).account_id;if(scenario.startsWith('preflight')&&(account===1||scenario==='preflight-all')){if(scenario==='preflight-block')value.blocked=true;else if(scenario==='preflight-busy')value.composer.busy=true;else if(scenario==='preflight-draft')value.composer.draftLength=9;else{res.statusCode=409;return res.end(JSON.stringify({detail:'browser_not_ready'}))}}return res.end(JSON.stringify(value))}
  if(req.url.startsWith('/api/kisara/browser/media/')){res.setHeader('Content-Type','image/png');return res.end(Buffer.from(decodeURIComponent(req.url.split('/').at(-1))))}
  assert.equal(req.url,'/api/kisara/browser/image-batch');const b=JSON.parse(raw);calls.push(b.account_id);
  if(scenario==='old'){res.statusCode=409;return res.end(JSON.stringify({detail:'batch_worker_outdated'}))}
  const results=[...b.tasks].reverse().map((t,i)=>scenario==='reference'?i===0?{id:t.id,mediaUrl:'/api/kisara/browser/media/'+t.id,submitted:true}:{id:t.id,error:i===1?'reference_upload_failed':'batch_stopped',submitted:false}:scenario==='quota'?{id:t.id,error:'quota_exhausted',submitted:false}:scenario==='partial'&&i===0?{id:t.id,error:'google_blocked',submitted:true}:{id:t.id,mediaUrl:'/api/kisara/browser/media/'+t.id,submitted:true});
  res.end(JSON.stringify({results}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));global.flowFixture.settings.flowBaseUrl='http://127.0.0.1:'+server.address().port;
 const requests=(n,offset=0)=>Array.from({length:n},(_,i)=>({id:'clip-'+(offset+i),prompt:'Scene '+i,aspect:'16:9',references:[],fingerprint:'test',identityKey:'Kenzo'}));
 const reset=()=>{for(const name of ['flow-browser-accounts.json','flow-generation-state.json'])fs.rmSync(path.join(temp,name),{force:true});calls=[];global.flowFixture.settings.flowBrowserAccountId=0};
 try{
  const used=[];for(const [n,offset] of [[10,0],[10,10],[5,20]]){const out=await f.generateImageBatch(requests(n,offset),new AbortController().signal,used);assert.equal(out.length,n);for(const r of out)assert.equal(r.bytes.toString(),r.id)}assert.deepEqual(calls,[1,2,3]);assert.deepEqual(used,[1,2,3]);
  await assert.rejects(f.generateImageBatch(requests(1),new AbortController().signal,used),/jatah/);assert.equal(calls.length,3);
  reset();scenario='preflight-project';const skipped=await f.generateImageBatch(requests(10),new AbortController().signal,[]);assert.equal(skipped.length,10);assert.deepEqual(calls,[2]);assert.equal((await f.flowSetup()).generationPause,undefined)
  reset();scenario='preflight-block';await assert.rejects(f.generateImageBatch(requests(10),new AbortController().signal,[]));assert.deepEqual(calls,[]);assert.equal((await f.flowSetup()).generationPause.code,'unusual_activity');console.log('PASS batch preflight: invalid project skipped, security block stops without submissions')
  reset();scenario='quota';await assert.rejects(f.generateImageBatch(requests(10),new AbortController().signal,[]));assert.deepEqual(calls,[1,2,3]);assert.equal((await f.flowSetup()).generationPause,undefined);
  reset();scenario='partial';const out=await f.generateImageBatch(requests(10),new AbortController().signal,[]);assert.equal(out.filter(r=>r.bytes).length,9);assert.equal(out.filter(r=>r.error).length,1);assert.equal((await f.flowSetup()).generationPause.code,'unusual_activity');assert.deepEqual(calls,[1]);
  reset();scenario='reference';const rejected=await f.generateImageBatch(requests(10),new AbortController().signal,[]);assert.equal(rejected.filter(r=>r.bytes).length,1);assert.equal(rejected.filter(r=>r.error).length,9);assert(rejected.find(r=>r.error?.includes('Generate belum ditekan')));assert.deepEqual(calls,[1]);assert.equal((await f.flowSetup()).generationPause,undefined);
  reset();scenario='old';await assert.rejects(f.generateImageBatch(requests(10),new AbortController().signal,[]),/Worker 1.6.0/);assert.equal((await f.flowSetup()).generationPause,undefined);
  console.log('TEN SERVICE PASS: 10+10+5 pinned to accounts 1,2,3; no revisit in same run; reverse download IDs; only explicit pre-submit quota may fail over; partial successes retained; Google block pauses; old worker sends no generation. Local HTTP only.');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
