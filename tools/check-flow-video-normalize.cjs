const {build}=require('esbuild'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict'),ffmpeg=require('ffmpeg-static');
(async()=>{
global.flowVideoFixture=fs.mkdtempSync(path.join(os.tmpdir(),'kisara-flow-video-'));
const source=path.join(global.flowVideoFixture,'source.webm');
cp.execFileSync(ffmpeg,['-y','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=12:duration=1','-c:v','libvpx-vp9',source],{windowsHide:true});
await build({entryPoints:['src/main/services/generatedVideo.ts'],bundle:true,platform:'node',external:['ffmpeg-static'],outfile:'tmp/bugcheck/generated-video-test.cjs',plugins:[{name:'paths',setup(b){b.onResolve({filter:/\.\.\/paths$/},()=>({path:'paths',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const dataDir=()=>global.flowVideoFixture,binPath=p=>p',loader:'js'}))}}]});
const {normalizeFlowVideo}=require(path.resolve('tmp/bugcheck/generated-video-test.cjs'));
const bytes=await normalizeFlowVideo(fs.readFileSync(source),new AbortController().signal);
assert.equal(bytes.toString('ascii',4,8),'ftyp');
const target=path.join(global.flowVideoFixture,'result.mp4');fs.writeFileSync(target,bytes);
const check=cp.spawnSync(ffmpeg,['-hide_banner','-i',target,'-f','null','-'],{windowsHide:true,encoding:'utf8'});assert.equal(check.status,0);assert.match(check.stderr,/Video: h264/);assert.equal(fs.readdirSync(path.join(global.flowVideoFixture,'tmp')).length,0);
console.log('FLOW VIDEO NORMALIZE PASS: real WebM becomes decodable H.264 MP4; temporary files removed.');
})().catch(e=>{console.error(e);process.exitCode=1});
