const {build}=require('esbuild'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 global.batchFixture={rows:new Map(),events:[]};
 await build({stdin:{contents:"export {runJob,waitForJob,cancelJob} from './src/main/jobs'; export {StopOnFailureBatch} from './src/main/serialBatch'",resolveDir:process.cwd()},platform:'node',bundle:true,outfile:'tmp/bugcheck/flow-batch-test.cjs',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^\.\/repo$/},()=>({path:'repo',namespace:'fixture'}));b.onResolve({filter:/^\.\/events$/},()=>({path:'events',namespace:'fixture'}));b.onResolve({filter:/services\/higgsfield$/},()=>({path:'hf',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='repo'?"export const getJobRaw=id=>global.batchFixture.rows.get(id);export const updateJob=(id,patch)=>{const j={...global.batchFixture.rows.get(id),...patch};global.batchFixture.rows.set(id,j);return j}":a.path==='events'?"export const emit={job:j=>global.batchFixture.events.push(j)}":"export const cancelRequest=async()=>{}"}))}}]});
 const f=require(path.resolve('tmp/bugcheck/flow-batch-test.cjs'));
 for(const failureAt of [-1,1]){
  const gate=new f.StopOnFailureBatch();let calls=[],inflight=0,peak=0;
  const jobs=Array.from({length:73},(_,i)=>({id:failureAt+':'+i,projectId:'fixture',clipId:String(i),kind:'image',provider:'flow2api',status:'queued'}));
  const old=console.error;console.error=()=>{};
  try{
   for(const [i,j] of jobs.entries()){
    global.batchFixture.rows.set(j.id,j);
    f.runJob(j,'flow2api',ctx=>gate.run(ctx.signal,()=>f.cancelJob(j.id),async()=>{calls.push(i);peak=Math.max(peak,++inflight);try{await new Promise(r=>setTimeout(r,2));if(i===failureAt)throw Error('Synthetic rejection');return 'asset-'+i}finally{inflight--}}));
   }
   await Promise.all(jobs.map(j=>f.waitForJob(j.id)));
  }finally{console.error=old}
  assert.equal(peak,1);
  if(failureAt<0){assert.deepEqual(calls,Array.from({length:73},(_,i)=>i));assert(jobs.every(j=>global.batchFixture.rows.get(j.id).status==='done'))}
  else{assert.deepEqual(calls,[0,1]);assert.equal(global.batchFixture.rows.get(jobs[0].id).resultAssetId,'asset-0');assert.equal(global.batchFixture.rows.get(jobs[1].id).status,'failed');assert(jobs.slice(2).every(j=>global.batchFixture.rows.get(j.id).status==='canceled'))}
 }
 console.log('FLOW BATCH PASS: 73 ordered jobs, concurrency=1, stop after first rejection, completed asset retained, remaining 71 canceled without submissions. No Google requests.');
})().catch(e=>{console.error(e);process.exitCode=1});
