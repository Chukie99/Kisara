const {build}=require('esbuild'),ts=require('typescript'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
const source=fs.readFileSync('src/main/generation.ts','utf8'), ast=ts.createSourceFile('generation.ts',source,ts.ScriptTarget.Latest,true), imports=new Map();
for(const n of ast.statements){if(!ts.isImportDeclaration(n)||!n.moduleSpecifier.text.startsWith('./'))continue;const bind=n.importClause?.namedBindings;if(!bind)continue;const names=ts.isNamedImports(bind)?bind.elements.filter(e=>!e.isTypeOnly).map(e=>(e.propertyName||e.name).text):[...source.matchAll(new RegExp('\\b'+bind.name.text+'\\.(\\w+)','g'))].map(m=>m[1]);imports.set(n.moduleSpecifier.text,[...new Set(names)]);}
global.clipFixture={temp:fs.mkdtempSync(path.join(os.tmpdir(),'kisara-clip-audit-'))};
const bodies={
'./repo':{activeJobFor:'()=>null',getClip:'()=>global.clipFixture.clip',getProject:'()=>global.clipFixture.project',charactersOf:"()=>[{name:'Kenzo'}]",insertJob:"j=>({...j,id:'j'})",insertAsset:"a=>{global.clipFixture.assets.push(a);return {...a,id:'audio'}}",patchClip:'(id,p)=>{global.clipFixture.patches.push(p)}'},
'./jobs':{runJob:'(j,q,task)=>{global.clipFixture.ctrl=new AbortController();global.clipFixture.done=task({signal:global.clipFixture.ctrl.signal,progress:()=>{}});return j}'},
'./events':{emit:'{job:()=>{},asset:()=>{},clip:()=>{}}'},
'./paths':{dataDir:'()=>global.clipFixture.temp',assetAbsPath:'(id,p)=>global.clipFixture.temp+"/"+p'},
'./settings':{getSettings:"()=>({f5VoiceId:'voice',supertonicPreset:'test'})"},
'./services/audio':{probeDurationMs:'async()=>1000'}
};
await build({entryPoints:['src/main/generation.ts'],bundle:true,platform:'node',outfile:'tmp/bugcheck/clip-tts-audit.cjs',alias:{'@shared':path.resolve('src/shared')},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^\.\//},a=>a.importer.endsWith('generation.ts')?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>{let custom=bodies[a.path]||{};if(['/gemini','/elevenlabs','/supertonic','/f5Local','/f5'].some(v=>a.path.endsWith(v)))custom={speak:`async(text,voice,third,fourth)=>{const f=global.clipFixture;f.sent.push(text);f.mutate();${a.path.endsWith('/gemini')?'return Buffer.from("fixture")':a.path.endsWith('/elevenlabs')?'return {audio:Buffer.from("fixture")}':'writeFileSync(typeof third==="string"&&third.endsWith(".wav")?third:fourth,"fixture")'}}`};return {loader:'js',contents:"import {writeFileSync} from 'node:fs';\n"+(imports.get(a.path)||[]).map(name=>'export const '+name+'='+ (custom[name]||'()=>{}')+';').join('\n')}})}}]});
const f=require(path.resolve('tmp/bugcheck/clip-tts-audit.cjs'));
for(const provider of ['gemini','elevenlabs','supertonic','f5-local','f5-hf'])for(const change of ['none','text','voice','provider','delivery','cancel']){
const x=global.clipFixture;Object.assign(x,{project:{id:'p',ttsProvider:provider,ttsVoice:'voice',language:'id',editor:{voiceDelivery:'natural'}},clip:{id:'c',projectId:'p',narration:'Kenzo: Aku menabung.'},assets:[],patches:[],sent:[]});
x.mutate=()=>{if(change==='text')x.clip={...x.clip,narration:'Naskah baru'};if(change==='voice')x.project={...x.project,ttsVoice:'new'};if(change==='provider')x.project={...x.project,ttsProvider:'other'};if(change==='delivery')x.project={...x.project,editor:{voiceDelivery:'dramatic'}};if(change==='cancel')x.ctrl.abort()};
f.generateClipTts('c');const rejected=change!=='none'&&!(change==='delivery'&&['supertonic','f5-local','f5-hf'].includes(provider));if(rejected){await assert.rejects(x.done);assert.equal(x.assets.length,0);assert.equal(x.patches.length,0)}else{await x.done;assert.equal(x.assets.length,1);assert.equal(x.patches.length,1);assert.equal(x.assets[0].meta.spokenText,'Aku menabung.')}
assert.deepEqual(x.sent,['Aku menabung.']);
}
console.log('CLIP TTS PASS: 30 provider/change cases; stale or canceled audio never replaces current clip; valid audio applies. No external requests.');
})().catch(e=>{console.error(e);process.exitCode=1});

