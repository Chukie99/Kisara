const { build } = require('esbuild'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
(async()=>{
 const wav=Buffer.alloc(44+24000*2*8);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);for(let i=0;i<24000*8;i++)wav.writeInt16LE(Math.round(Math.sin(i/24000*440*2*Math.PI)*5000),44+i*2);
 global.speakerFixture={temp:fs.mkdtempSync(path.join(os.tmpdir(),'kisara-speakers-')),wav};
 await build({entryPoints:['src/main/narration.ts'],bundle:true,platform:'node',external:['electron','ffmpeg-static'],outfile:'tmp/bugcheck/tts-speaker-inputs.cjs',alias:{'@shared':path.resolve('src/shared')},plugins:[{name:'isolated-services',setup(b){
 b.onResolve({filter:/^\.\/(repo|events|settings|paths|jobs|whisper|soundEffects|services\/(elevenlabs|gemini|supertonic|f5Local|f5))$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='./repo'?`
 export const activeProjectJob=()=>null,getProject=()=>global.speakerFixture.project,charactersOf=()=>[{name:'Kenzo'}],clipsOf=()=>global.speakerFixture.clips,getClip=id=>global.speakerFixture.clips.find(c=>c.id===id),getAsset=id=>global.speakerFixture.assets.find(a=>a.id===id),insertJob=j=>({...j,id:'fixture-job'}),insertAsset=a=>{const value={...a,id:'asset-'+global.speakerFixture.assets.length};global.speakerFixture.assets.push(value);return value},patchClip=(id,p)=>Object.assign(getClip(id),p),touchProject=()=>{},updateAssetMeta=()=>{};
 `:a.path==='./events'?'export const emit={job:()=>{},asset:()=>{},clip:()=>{}}':a.path==='./paths'?"import {join} from 'node:path';export const dataDir=()=>global.speakerFixture.temp,binPath=x=>x,assetAbsPath=(id,p)=>join(global.speakerFixture.temp,id,p)":a.path==='./settings'?"export const getSettings=()=>({whisperAuto:false,f5VoiceId:'voice',supertonicPreset:'fixture',geminiTtsModel:'fixture',elevenModel:'fixture',f5Space:'fixture',f5Endpoint:'fixture'})":a.path==='./jobs'?"export const runJob=(j,q,task)=>{global.speakerFixture.done=task({jobId:j.id,signal:new AbortController().signal,progress:()=>{}});return j}":a.path==='./whisper'?'export const whisperReady=()=>false,timeScript=()=>{}':a.path==='./soundEffects'?'export const ensureSoundEffects=async()=>{}':`
 import {writeFileSync} from 'node:fs';export const speak=async(text,voice,third,fourth)=>{global.speakerFixture.sent.push(text);${a.path.endsWith('/gemini')?'return global.speakerFixture.wav':a.path.endsWith('/elevenlabs')?"return {audio:global.speakerFixture.wav,words:text.split(/\\s+/).filter(Boolean).map((word,i)=>({word,start:i*.25,end:i*.25+.2}))}":"writeFileSync(typeof third==='string'&&third.endsWith('.wav')?third:fourth,global.speakerFixture.wav)"}};
 `}));
 }}]});
 const f=require(path.resolve('tmp/bugcheck/tts-speaker-inputs.cjs'));
 for(const provider of ['gemini','elevenlabs','supertonic','f5-local','f5-hf']){
  const original=['Narator: Kenzo menyiapkan tabungan.','Kenzo, “Mulai dari seribu rupiah.”'];
  Object.assign(global.speakerFixture,{project:{id:'isolated',ttsProvider:provider,ttsVoice:'voice',language:'id',editor:{voiceDelivery:'natural',narrationSpeed:.9}},clips:original.map((narration,i)=>({id:'c'+i,projectId:'isolated',narration,audioAssetId:null,durationMs:4000})),assets:[],sent:[]});
  f.generateNarration('isolated','all');await global.speakerFixture.done;
  assert.equal(global.speakerFixture.sent.length,1);const text=global.speakerFixture.sent[0];assert(text.includes('Kenzo menyiapkan tabungan.'));assert(text.includes('Mulai dari seribu rupiah.'));assert(!text.includes('Narator:'));assert(!text.includes('Kenzo,'));
  assert.deepEqual(global.speakerFixture.clips.map(c=>c.narration),original);assert.equal(global.speakerFixture.assets.length,2);
  for(const [i,a] of global.speakerFixture.assets.entries()){assert.equal(a.prompt,original[i]);assert.equal(a.meta.spokenText,i?'“Mulai dari seribu rupiah.”':'Kenzo menyiapkan tabungan.');assert(fs.statSync(path.join(global.speakerFixture.temp,'isolated',a.localPath)).size>44);assert(a.meta.words.length>0)}
  console.log('PASS '+provider+': actual narration orchestration sends dialogue without speaker labels, cuts audio and stores matching caption words; source script retained');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
