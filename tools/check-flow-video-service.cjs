const {build}=require('esbuild'), assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'), path=require('node:path'), http=require('node:http');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kisara-router-integration-'));
 global.flowFixture={temp,key:'synthetic-key',settings:{flowVideoInputMode:'frames',flowImageTransport:'browser',flowBrowserAccountId:0}};
 await build({entryPoints:['src/main/services/flow2api.ts'],bundle:true,platform:'node',format:'cjs',outfile:'tmp/bugcheck/router-client.cjs',plugins:[{name:'isolated-settings',setup(b){b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'electron-fixture'}));b.onLoad({filter:/.*/,namespace:'electron-fixture'},()=>({loader:'js',contents:"export const app={getPath:()=>globalThis.flowFixture?.temp||globalThis.routerFixture?.temp}"}));b.onResolve({filter:/^\.\.\/(settings|secrets|paths)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.endsWith('paths')?'export const dataDir=()=>global.flowFixture.temp':a.path.endsWith('secrets')?'export const requireSecret=()=>global.flowFixture.key':'export const getSettings=()=>global.flowFixture.settings'}))}}]});
 const f=require(path.resolve('tmp/bugcheck/router-client.cjs'));


 let scenario='success',active=0,peak=0,calls=[];
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;res.setHeader('Content-Type','application/json');
  if(req.url==='/api/kisara/status')return res.end(JSON.stringify({browserParallelVersion:scenario==='old'?undefined:1,browserMediaVersion:2,browserFramesVersion:1,extensionMode:true,workers:[],accounts:[1,2,3].map(id=>({id,email:id+'@example.test',routeKey:'account-'+id,workerConnected:true,active:true,imageEnabled:true,uncertainResult:scenario==='pending'&&id!==3}))}));
  if(req.url==='/api/kisara/browser/inspect')return res.end(JSON.stringify({host:'flow.google.com',projectOpen:true,blocked:scenario==='blocked',composer:{editors:1,draftLength:0,submitCount:1,submitDisabled:true,busy:scenario==='busy'&&JSON.parse(raw).account_id===2,online:true},fields:[],buttons:[],options:[]}));
  if(req.url.startsWith('/api/kisara/browser/media/')){res.setHeader('Content-Type','video/mp4');return res.end(req.url.split('/').at(-1))}
  assert.equal(req.url,'/api/kisara/browser/image');const b=JSON.parse(raw);assert.equal(b.kind,'video');assert.equal(b.video_input_mode,'frames');assert.equal(b.references.length,1);calls.push(b.account_id);peak=Math.max(peak,++active);
  await new Promise(r=>setTimeout(r,b.account_id===1?50:5));active--;
  if(scenario==='multiple'){res.statusCode=409;return res.end(JSON.stringify({detail:'multiple_outputs'}))}
  if(scenario==='quota'){res.statusCode=409;return res.end(JSON.stringify({detail:'quota_exhausted'}))}
  res.end(JSON.stringify({mediaUrl:'/api/kisara/browser/media/'+b.account_id}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));global.flowFixture.settings.flowBaseUrl='http://127.0.0.1:'+server.address().port;
 const reset=()=>{for(const name of ['flow-browser-accounts.json','flow-generation-state.json'])fs.rmSync(path.join(temp,name),{force:true});calls=[];global.flowFixture.settings.flowBrowserAccountId=0};
 try{
  assert.deepEqual(await f.parallelVideoAccounts(),[1,2,3]);
  const out=await Promise.all([1,2,3].map(id=>f.generateAccountVideo(id,'Scene '+id,'16:9',[Buffer.from('image-'+id)],new AbortController().signal)));assert.equal(peak,3);assert.deepEqual(out.map(b=>b.toString()),['1','2','3']);
  reset();global.flowFixture.settings.flowBrowserAccountId=2;assert.deepEqual(await f.parallelVideoAccounts(),[]);
  reset();scenario='busy';assert.deepEqual(await f.parallelVideoAccounts(),[1,3]);
  reset();scenario='pending';assert.deepEqual(await f.parallelVideoAccounts(),[3]);
  reset();scenario='old';await assert.rejects(f.parallelVideoAccounts(),/Mulai ulang server/);assert.deepEqual(calls,[]);
  reset();scenario='blocked';await assert.rejects(f.parallelVideoAccounts());assert.deepEqual(calls,[]);assert.equal((await f.flowSetup()).generationPause.code,'unusual_activity');
  reset();scenario='multiple';await assert.rejects(f.generateAccountVideo(2,'Scene','16:9',[Buffer.from('image')],new AbortController().signal),/lebih dari satu hasil video baru/);assert.deepEqual(calls,[2]);
  reset();scenario='quota';await assert.rejects(f.generateAccountVideo(2,'Scene','16:9',[Buffer.from('image')],new AbortController().signal),/Kuota/);assert.deepEqual(calls,[2]);assert.equal((await f.flowSetup()).generationPause,undefined);
  console.log('VIDEO SERVICE PASS: three concurrent pinned accounts, reference/result mapping, manual serial, busy skipped, old backend refused before submit, Google block pauses, quota never reroutes an in-flight video. Local HTTP only.');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});