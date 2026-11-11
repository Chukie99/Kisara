const {build}=require('esbuild'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 await build({entryPoints:['src/main/flowImageBatch.ts'],bundle:true,platform:'node',outfile:'tmp/bugcheck/ten-coordinator.cjs'});
 const {FlowImageBatch}=require(path.resolve('tmp/bugcheck/ten-coordinator.cjs'));
 const prepare=id=>({id,prompt:'Scene '+id,aspect:'16:9',references:[],fingerprint:'snapshot-'+id,identityKey:'Kenzo'});
 for(const fail of [false,true]){
  const ids=Array.from({length:73},(_,i)=>String(i)),calls=[];
  const batch=new FlowImageBatch(ids,prepare,async requests=>{calls.push(requests.map(r=>r.id));return [...requests].reverse().map(r=>fail&&r.id==='3'?{id:r.id,error:'Synthetic rejection'}:{id:r.id,bytes:Buffer.from(r.id)})});
  const done=[];
  for(const id of ids){if(!batch.canDrain(id))continue;try{assert.equal((await batch.image(id,new AbortController().signal)).toString(),id);done.push(id)}catch(e){assert(fail);batch.stop()}}
  if(!fail){assert.equal(calls.length,8);assert.deepEqual(calls.map(g=>g.length),[10,10,10,10,10,10,10,3]);assert.equal(done.length,73)}
  else{assert.equal(calls.length,1);assert.equal(done.length,9);assert(!done.includes('3'));assert(done.includes('9'));assert(!batch.canDrain('10'))}
 }
 const known=new FlowImageBatch(['a','b','c'],prepare,async()=>[{id:'a',bytes:Buffer.from('a')},{id:'b',error:'Reference verification failed'},{id:'c',error:'Not attempted',skipped:true}]);await known.image('a',new AbortController().signal);assert(known.canDrain('b'));assert(!known.canDrain('c'));await assert.rejects(known.image('b',new AbortController().signal),/Reference verification failed/);
 let sent=0;const bad=new FlowImageBatch(['a','b'],prepare,async()=>{sent++;return [{id:'a',bytes:Buffer.from('x')},{id:'a',bytes:Buffer.from('y')}]});
 await assert.rejects(bad.image('a',new AbortController().signal),/Pemetaan/);assert(!bad.canDrain('b'));assert.equal(sent,1);
 const cancel=new AbortController();cancel.abort();const aborted=new FlowImageBatch(['a'],prepare,async(_,signal)=>{signal.throwIfAborted();throw Error('Must not submit')});await assert.rejects(aborted.image('a',cancel.signal));assert(!aborted.canDrain('a'));
 console.log('TEN COORDINATOR PASS: 73 images in groups of ten; reverse results matched by ID; partial failure drains nine successes and sends no next group; duplicate IDs rejected; cancellation stops.');
})().catch(e=>{console.error(e);process.exitCode=1});
