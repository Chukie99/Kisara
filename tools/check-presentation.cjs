const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');const {build}=require('esbuild');
(async()=>{const dir=path.resolve('tmp/bugcheck/presentation-'+Date.now());fs.mkdirSync(dir,{recursive:true});await build({entryPoints:['src/shared/presentation.ts'],bundle:true,platform:'node',outfile:path.join(dir,'shared.cjs')});const {presentationOverlay,resolvePresentationOverlays:resolve}=require(path.join(dir,'shared.cjs'));
const c={id:'c',narration:'Ia menyimpan Rp15 juta untuk biaya sekolah.',durationMs:8000,voiceInMs:0,voiceOutMs:null,voiceStartMs:0,audioAssetId:'a'};
assert.throws(()=>presentationOverlay(c,'Rp50 juta','Rp15 juta','id'),/kutipan/);assert.equal(presentationOverlay(c,'','','id'),null);assert.throws(()=>presentationOverlay(c,'KAYA','KAYA','id'),/kutipan/);
const overlay=presentationOverlay(c,'RP15 JUTA','Rp15 juta','id');const audio={id:'a',durationMs:8000,meta:{words:[{text:'Ia',start:0,end:.3},{text:'menyimpan',start:.4,end:.8},{text:'lima',start:1,end:1.2},{text:'belas',start:1.2,end:1.4},{text:'juta',start:1.4,end:1.6},{text:'rupiah',start:1.6,end:2},{text:'untuk',start:2.1,end:2.4}]}};
// Currency expansion is shared with TTS, so word matching follows spoken rather than display tokens.
const base=resolve([overlay],[c],{a:audio});assert.equal(base.length,1);assert.equal(base[0].start,1);assert.equal(base[0].end,2.35);
const moved=resolve([overlay],[{...c,id:'lead',durationMs:3000},c],{a:audio});assert.equal(moved[0].start,4);
const trimmed=resolve([overlay],[{...c,voiceInMs:500,voiceStartMs:200}],{a:audio});assert.equal(trimmed[0].start,.7);
assert.equal(resolve([overlay],[{...c,narration:c.narration+' Baru.'}],{a:audio}).length,0);
assert.equal(resolve([overlay],[{...c,voiceInMs:2500}],{a:audio}).length,0);
const manual={...overlay,presentationCue:undefined,start:4,end:6};assert.deepEqual(resolve([manual],[{...c,narration:'Edit'}],{}),[manual]);
assert.equal(resolve([overlay],[{...c,audioAssetId:null}],{}).length,1);assert.equal(resolve([overlay],[],{}).length,0);
await build({entryPoints:['src/shared/overlays.ts'],bundle:true,platform:'node',outfile:path.join(dir,'overlays.cjs')});const {splitOverlay}=require(path.join(dir,'overlays.cjs'));const halves=splitOverlay(base[0],1.5,'second');assert(halves.every(o=>!o.presentationCue));assert.deepEqual(halves.map(o=>[o.start,o.end]),[[1,1.5],[1.5,2.35]]);
console.log('PRESENTATION PASS: literal quote guard, Indonesian currency/TTS tokens, actual/estimated timings, voice trims, reordering, stale suppression and manual timing preservation. '+dir)
})().catch(e=>{console.error(e);process.exitCode=1});
