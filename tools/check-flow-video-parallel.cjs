const assert=require('node:assert/strict'),path=require('node:path'),{build}=require('esbuild');
(async()=>{
 global.batchFixture={rows:new Map(),events:[]};
 await build({stdin:{contents:"export {runJob,waitForJob,cancelJob} from './src/main/jobs';export {FlowVideoBatch} from './src/main/flowVideoBatch'",resolveDir:process.cwd()},platform:'node',bundle:true,outfile:'tmp/bugcheck/flow-video-parallel.cjs',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^\.\/repo$/},()=>({path:'repo',namespace:'fixture'}));b.onResolve({filter:/^\.\/events$/},()=>({path:'events',namespace:'fixture'}));b.onResolve({filter:/services\/higgsfield$/},()=>({path:'hf',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='repo'?"export const getJobRaw=id=>global.batchFixture.rows.get(id);export const updateJob=(id,patch)=>{const j={...global.batchFixture.rows.get(id),...patch};global.batchFixture.rows.set(id,j);return j}":a.path==='events'?"export const emit={job:j=>global.batchFixture.events.push(j)}":"export const cancelRequest=async()=>{}"}))}}]});
 const f=require(path.resolve('tmp/bugcheck/flow-video-parallel.cjs'));
 for(const [accounts,fail] of [[[1,2,3],false],[[1,2],false],[[1,2,3],true]]){
  const pool=new f.FlowVideoBatch(accounts),busy=new Set(),submitted=[],completed=[];let peak=0;
  const jobs=Array.from({length:12},(_,i)=>({id:accounts.length+':'+fail+':'+i,kind:'video',status:'queued'}));
  const old=console.error;console.error=()=>{};
  try{for(const [i,j] of jobs.entries()){
   global.batchFixture.rows.set(j.id,j);
   f.runJob(j,'flow-video',ctx=>pool.run(ctx.signal,()=>f.cancelJob(j.id),async account=>{
    assert(!busy.has(account));busy.add(account);submitted.push(i);peak=Math.max(peak,busy.size);
    try{await new Promise(r=>setTimeout(r,fail?(i===0?5:30):(i===0?30:5)));if(fail&&i===0)throw Error('Synthetic rejection');completed.push(i);return 'asset-'+i}finally{busy.delete(account)}
   }));
  }await Promise.all(jobs.map(j=>f.waitForJob(j.id)))}finally{console.error=old}
  assert.equal(peak,accounts.length);
  if(fail){assert.deepEqual(submitted,[0,1,2]);assert.equal(global.batchFixture.rows.get(jobs[1].id).resultAssetId,'asset-1');assert.equal(global.batchFixture.rows.get(jobs[2].id).resultAssetId,'asset-2');assert(jobs.slice(3).every(j=>global.batchFixture.rows.get(j.id).status==='canceled'))}
  else{assert.equal(completed.length,12);assert.notEqual(completed[0],0);for(const [i,j]of jobs.entries())assert.equal(global.batchFixture.rows.get(j.id).resultAssetId,'asset-'+i)}
 }
 const pool=new f.FlowVideoBatch([1]),first=new AbortController(),second=new AbortController();let release;const running=pool.run(first.signal,async()=>{},()=>new Promise(r=>release=r));const waiting=pool.run(second.signal,async()=>{},async()=>{throw Error('must not submit')});second.abort();await assert.rejects(waiting);release();await running;
 console.log('PARALLEL VIDEO QUEUE PASS: 3/2 accounts overlap; one job per account; reversed completion mapped; failure stops queued submissions and retains in-flight successes; waiting cancellation. No Google requests.');
})().catch(e=>{console.error(e);process.exitCode=1});