const {build}=require('esbuild'),ts=require('typescript'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
const source=fs.readFileSync('src/main/generation.ts','utf8'), ast=ts.createSourceFile('generation.ts',source,ts.ScriptTarget.Latest,true), imports=new Map();
for(const n of ast.statements){if(!ts.isImportDeclaration(n)||!n.moduleSpecifier.text.startsWith('./'))continue;const bind=n.importClause?.namedBindings;if(!bind)continue;const names=ts.isNamedImports(bind)?bind.elements.filter(e=>!e.isTypeOnly).map(e=>(e.propertyName||e.name).text):[...source.matchAll(new RegExp('\\b'+bind.name.text+'\\.(\\w+)','g'))].map(m=>m[1]);imports.set(n.moduleSpecifier.text,[...new Set(names)]);}

global.clipFixture={temp:fs.mkdtempSync(path.join(os.tmpdir(),'kisara-hf-stale-'))};
const bodies={
 './repo':{activeJobFor:'()=>null',getClip:'()=>global.clipFixture.clip',getProject:'()=>global.clipFixture.project',charactersOf:'()=>[]',getAsset:'()=>global.clipFixture.image',insertJob:"j=>({...j,id:'j'})",insertAsset:"a=>{global.clipFixture.assets.push(a);return {...a,id:'result'}}",patchClip:'(id,p)=>global.clipFixture.patches.push(p)'},
 './jobs':{runJob:'(j,q,task)=>{global.clipFixture.done=task({signal:new AbortController().signal,progress:()=>{},setRemote:()=>{}});return j}'},
 './events':{emit:'{job:()=>{},asset:()=>{},clip:()=>{}}'},
 './paths':{assetAbsPath:'(id,p)=>global.clipFixture.temp+"/"+p'},
 './settings':{getSettings:"()=>({imageProvider:'higgsfield'})"},
 './db':{getDb:'()=>({prepare:()=>({run:()=>{}})})'},
 './services/audio':{probeDurationMs:'async()=>1000',probeSize:'async()=>({width:320,height:180})'},
 './services/http':{downloadTo:"async()=>({bytes:Buffer.from('fixture'),contentType:'video/mp4'})"},
 './services/higgsfield':{submit:"async()=> 'request'",waitForResult:"async()=>{global.clipFixture.mutate();return {video:{url:'https://fixture/result.mp4'}}}"}
};
await build({entryPoints:['src/main/generation.ts'],bundle:true,platform:'node',outfile:'tmp/bugcheck/hf-stale.cjs',alias:{'@shared':path.resolve('src/shared')},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^\.\//},a=>a.importer.endsWith('generation.ts')?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:(imports.get(a.path)||[]).map(name=>'export const '+name+'='+(bodies[a.path]?.[name]||'()=>{}')+';').join('\n')}))}}]});
const f=require(path.resolve('tmp/bugcheck/hf-stale.cjs'));
for(const change of ['none','image','prompt','aspect','model','resolution']){
 const x=global.clipFixture;Object.assign(x,{project:{id:'p',videoModel:undefined,aspectRatio:'16:9',videoResolution:'720p'},clip:{id:'c',projectId:'p',imageAssetId:'image',videoPrompt:'An existing hand slides one coin.',durationMs:5000},image:{id:'image',projectId:'p',provider:'higgsfield',remoteUrl:'https://fixture/image.png',createdAt:Date.now()},assets:[],patches:[]});
 x.mutate=()=>{if(change==='image')x.clip.imageAssetId='new-image';if(change==='prompt')x.clip.videoPrompt='A different action.';if(change==='aspect')x.project.aspectRatio='9:16';if(change==='model')x.project.videoModel='other';if(change==='resolution')x.project.videoResolution='1080p'};
 f.generateClipVideo('c');
 if(change==='none'){await x.done;assert.equal(x.patches.length,1)}else{await assert.rejects(x.done,/Adegan berubah/);assert.equal(x.patches.length,0)}
 assert.equal(x.assets.length,1,'Completed result must remain in history even when stale');
}
console.log('HIGGSFIELD STALE PASS: current video applies; changed image/prompt/aspect/model/resolution keeps result in history without overwriting clip. Synthetic provider only.');
})().catch(e=>{console.error(e);process.exitCode=1});