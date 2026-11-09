const assert=require('node:assert/strict'),http=require('node:http'),{build}=require('esbuild'),path=require('node:path');
(async()=>{
 await build({entryPoints:['src/main/services/flowBrowserHttp.ts'],bundle:true,platform:'node',outfile:'tmp/bugcheck/flow-http.cjs'});
 const {browserJson}=require(path.resolve('tmp/bugcheck/flow-http.cjs'));
 let submits=0;const long=process.argv.includes('--long');
 const server=http.createServer((req,res)=>{submits++;req.resume();req.on('end',()=>{const timer=setTimeout(()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({mediaUrl:'/api/kisara/browser/media/fixture'}))},long?310000:120);res.on('close',()=>clearTimeout(timer))})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/api/kisara/browser/image';
 try{
  const start=Date.now();const heartbeat=long?setInterval(()=>console.log('WAITING LONG HEADERS seconds='+Math.round((Date.now()-start)/1000)),45000):null;
  try{const r=await browserJson(url,'fixture-key',{kind:'video'},AbortSignal.timeout(long?330000:3000));assert.equal(r.status,200);assert.equal((await r.json()).mediaUrl,'/api/kisara/browser/media/fixture');assert.equal(submits,1);if(long)assert(Date.now()-start>300000)}finally{if(heartbeat)clearInterval(heartbeat)}
  await assert.rejects(browserJson(url,'fixture-key',{},AbortSignal.timeout(25)));await new Promise(r=>setTimeout(r,80));assert.equal(submits,2);
  assert.throws(()=>browserJson('https://example.com/api/kisara/browser/image','fixture-key',{},AbortSignal.timeout(50)));
  console.log('FLOW HTTP PASS: '+(long?'response headers after 310 seconds':'delayed headers')+', one request, cancellation without retry, loopback only.');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
