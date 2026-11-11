const {build}=require('esbuild'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 await build({entryPoints:['src/shared/flow.ts'],bundle:true,platform:'node',outfile:'tmp/bugcheck/flow-prompts.cjs'});
 const f=require(path.resolve('tmp/bugcheck/flow-prompts.cjs'));
 const clip={id:'one',title:'Hitung biaya',sort:0,durationMs:6000,narration:'',videoPrompt:'',visualPrompt:'',imageAssetId:'existing-scene',characterIds:[],story:null};
 const plan=f.buildFlowPlan({project:{title:'Fixture',synopsis:'',styleId:'stickman',aspectRatio:'9:16',editor:{flowMode:'video'}},clips:[clip],characters:[],assets:[]});
 assert.equal(plan.scenes[0].videoReady,true);assert.equal(plan.scenes[0].videoPrompt,f.flowVideoPrompt(clip));assert(plan.scenes[0].videoPrompt.includes('small natural gestures'));
 assert(!plan.scenes[0].videoPrompt.includes('Narrative context only'));assert(f.flowText(plan).includes('PROMPT IMAGE TO VIDEO'));
 const action={...clip,videoPrompt:'The fee block joins the price block.',narration:'Total uang keluar bertambah.'};const text=f.flowVideoPrompt(action);assert(text.includes(action.videoPrompt));assert(text.includes(action.narration));assert(text.includes('existing text and numbers'));assert(text.includes('No spoken dialogue'));assert(text.includes('overrides conflicting descriptions'));assert(text.includes('one primary action once'));assert(text.includes('never reset the scene'));assert(text.includes('Camera locked'));assert(text.includes('do not turn abstract claims into literal events'));assert(!text.includes('camera slowly pushes in'));
 console.log('FLOW PROMPT PASS: ready images work without TTS or fresh script prompt; fallback motion; manual export uses shared I2V prompt; existing financial values preserved.');
})().catch(e=>{console.error(e);process.exitCode=1});
