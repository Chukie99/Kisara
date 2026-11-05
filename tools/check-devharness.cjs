const {build}=require('esbuild');const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{
 await build({entryPoints:['src/main/devHarnessTools.ts'],bundle:true,platform:'node',outfile:'tmp/bugcheck/devharness-tools.cjs'});
 const {runFixtureTool,isolatedHarnessProfile}=require(path.resolve('tmp/bugcheck/devharness-tools.cjs'));
 const protectedPaths=['F:/storybot','F:/Kisara'];
 assert.equal(isolatedHarnessProfile(undefined,'F:/storybot',protectedPaths),false);
 assert.equal(isolatedHarnessProfile('F:/storybot','F:/storybot',protectedPaths),false);
 assert.equal(isolatedHarnessProfile('F:/Kisara','F:/Kisara',protectedPaths),false);
 assert.equal(isolatedHarnessProfile('F:/test-profile','F:/storybot',protectedPaths),false);
 assert.equal(isolatedHarnessProfile('F:/test-profile','F:/test-profile',protectedPaths),true);
 const original=process.stderr.write;let forwarded=0;
 process.stderr.write=()=>{forwarded++;throw Object.assign(new Error('closed parent stderr'),{code:'EPIPE'})};
 try {
  runFixtureTool(process.execPath,['-e',"process.stderr.write('fixture stderr');process.stdout.write('fixture stdout')"]);
  assert.throws(()=>runFixtureTool(process.execPath,['-e',"process.stderr.write('intentional fixture failure');process.exit(7)"]),e=>e.status===7);
 } finally {process.stderr.write=original}
 assert.equal(forwarded,0);
 console.log('HARNESS REGRESSION PASS: successful and failing children do not forward into closed parent stderr; failed child still throws; missing/mismatched/production data profiles cannot enable harness.');
})().catch(e=>{console.error(e);process.exitCode=1});
