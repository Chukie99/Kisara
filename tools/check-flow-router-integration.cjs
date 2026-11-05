const {build}=require('esbuild'), assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'), path=require('node:path'), http=require('node:http');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kisara-router-integration-'));
 global.flowFixture={temp,key:'synthetic-key',settings:{flowImageTransport:'browser',flowBrowserAccountId:0}};
 await build({entryPoints:['src/main/services/flow2api.ts'],bundle:true,platform:'node',format:'cjs',outfile:'tmp/bugcheck/router-client.cjs',plugins:[{name:'isolated-settings',setup(b){b.onResolve({filter:/^\.\.\/(settings|secrets|paths)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.endsWith('paths')?'export const dataDir=()=>global.flowFixture.temp':a.path.endsWith('secrets')?'export const requireSecret=()=>global.flowFixture.key':'export const getSettings=()=>global.flowFixture.settings'}))}}]});
 const f=require(path.resolve('tmp/bugcheck/router-client.cjs'));
 const png=Buffer.from('synthetic-media');
 let scenario='quota',calls=[],used=[0,0,0];
 const server=http.createServer(async(req,res)=>{
  let body='';for await(const c of req)body+=c;res.setHeader('Content-Type','application/json');
  if(req.url==='/api/kisara/status')return res.end(JSON.stringify({extensionMode:true,workers:[],accounts:[1,2,3].map(id=>({id,email:`${id}@example.test`,routeKey:`acct-${id}`,workerConnected:true,active:true,imageEnabled:true}))}));
  if(req.url==='/api/kisara/browser/acknowledge')return res.end('{"ok":true}');
  assert.equal(req.url,'/api/kisara/browser/image');const b=JSON.parse(body);calls.push(b.account_id);
  const quota=scenario==='all-quota'||scenario==='quota'&&used[b.account_id-1]>=[2,3,100][b.account_id-1];
  const code=quota?'quota_exhausted':scenario==='quota'||scenario==='success'?'':scenario;
  if(code){res.statusCode=409;return res.end(JSON.stringify({detail:code}))}
  used[b.account_id-1]++;res.end(JSON.stringify({mediaUrl:'data:image/png;base64,'+png.toString('base64')}));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));global.flowFixture.settings.flowBaseUrl='http://127.0.0.1:'+server.address().port;
 const generate=()=>f.generate('image','Synthetic','16:9',[],new AbortController().signal);
 const reset=()=>{for(const file of ['flow-browser-accounts.json','flow-generation-state.json'])fs.rmSync(path.join(temp,file),{force:true});calls=[];used=[0,0,0];global.flowFixture.settings.flowBrowserAccountId=0};
 try{
  await f.assertFlowReady('image');
  for(let i=0;i<73;i++)assert((await generate()).equals(png));
  assert.deepEqual(used,[2,3,68]);assert.equal(calls.length,75);
  delete require.cache[require.resolve(path.resolve('tmp/bugcheck/router-client.cjs'))];const restarted=require(path.resolve('tmp/bugcheck/router-client.cjs'));
  await restarted.generate('image','After restart','9:16',[],new AbortController().signal);assert.equal(calls.at(-1),3);
  console.log('PASS real client: 73 images, accounts 1 -> 2 -> 3, sticky choice survives module restart');
  reset();scenario='all-quota';await assert.rejects(generate(),/semua akun/);assert.deepEqual(calls,[1,2,3]);await assert.rejects(generate(),/semua akun/);assert.equal(calls.length,3);
  scenario='success';global.flowFixture.settings.flowBrowserAccountId=1;await generate();global.flowFixture.settings.flowBrowserAccountId=0;await generate();assert.deepEqual(calls,[1,2,3,1,1]);console.log('PASS all quotas: no repeated submissions; explicit manual success restores account');
  reset();scenario='quota_exhausted';global.flowFixture.settings.flowBrowserAccountId=2;await assert.rejects(generate(),/Kuota akun/);assert.deepEqual(calls,[2]);console.log('PASS manual selection: no account switching');
  for(const code of ['submit_not_ready','prompt_input_failed','native_input_unavailable']){reset();scenario=code;await assert.rejects(generate(),/Permintaan belum dikirim|permintaan belum dikirim/);assert.equal((await f.flowSetup()).generationPause,undefined);assert.equal(calls.length,1);scenario='success';await generate();assert.equal(calls.length,2);console.log('PASS '+code+': precise pre-submit failure, no uncertain pause')}
  for(const code of ['submit_unconfirmed','pending_timeout','result_timeout','media_download_failed','multiple_outputs','google_blocked','result_uncertain','approval_required']){
   reset();scenario=code;await assert.rejects(generate());assert.deepEqual(calls,[1]);await assert.rejects(generate());assert.equal(calls.length,1);
   await f.resumeFlowGeneration();scenario='quota_exhausted';await assert.rejects(generate());assert.deepEqual(calls,[1,1]);console.log('PASS '+code+': global pause, one explicit probe, no failover during probe');
  }
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
 console.log('PRODUCTION ROUTER CLIENT PASS. Local HTTP only; no Google or user data accessed.');
})().catch(e=>{console.error(e);process.exitCode=1});
