const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process'), assert = require('node:assert/strict');
const dir = path.resolve('tmp/bugcheck/channel-visual-' + Date.now());
fs.mkdirSync(dir, { recursive: true });
const click = label => `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Button unavailable: '+${JSON.stringify(label)});b.click()})()`;
const openMenu = { js: `(()=>{const b=document.querySelector('button[aria-label^="Gaya visual:"]');if(!b)throw Error('Style menu missing');b.scrollIntoView({block:'center'});b.click()})()`, wait: 400 };
function run(name, plan, marker) {
  const file = path.join(dir, name + '.json'), log = path.join(dir, name + '.log');
  fs.writeFileSync(file, JSON.stringify(plan, null, 2));
  const env = { ...process.env, STUDIO_CAPTURE_PLAN: file, STUDIO_USER_DATA: path.join(dir, name + '-profile'), STUDIO_LOG: log };
  delete env.ELECTRON_RUN_AS_NODE;
  const out = spawnSync(path.resolve('node_modules/electron/dist/electron.exe'), ['.'], { env, cwd: process.cwd(), windowsHide: true, encoding: 'utf8', timeout: 60000 });
  fs.writeFileSync(path.join(dir, name + '.stdout'), out.stdout || '');
  fs.writeFileSync(path.join(dir, name + '.stderr'), out.stderr || '');
  const content = (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '') + out.stdout;
  assert(!out.error, String(out.error));
  assert.equal(out.status, 0, content.slice(-2000));
  assert(!/\[harness-error\]/.test(content), content.slice(-2500));
  assert(content.includes(marker), content.slice(-2500));
  console.log(name + ' PASS: ' + marker);
}
run('integration', [{ main: 'seed' }, { main: 'channelVisualChecks' }, { quit: true }], 'CHANNEL VISUAL NATIVE PASS');
run('ui', [
  { main: 'mockStyleUpload', size: [1180, 720] },
  { js: click('Tulis ide sendiri'), wait: 350 },
  { js: `(()=>{const d=[...document.querySelectorAll('details')].find(d=>d.textContent.includes('Pengaturan tambahan'));if(d)d.open=true;document.querySelector('button[aria-label^="Gaya visual:"]').scrollIntoView({block:'center'})})()`, wait: 250 }, openMenu,
  { js: click('Upload gaya saja'), wait: 600 },
  { js: `(async()=>{const s=await window.api.settings.get();if(s.channelCharacterReference===s.channelStyleReference)throw Error('Style-only upload changed identity');window.savedStyle=s.channelStyleReference})()` },
  { js: click('Jadikan gambar gaya sebagai karakter'), wait: 600 },
  { js: `(async()=>{const s=await window.api.settings.get();if(s.channelCharacterReference!==window.savedStyle||s.channelCharacterDescription.includes('Kenzo'))throw Error('Promotion kept stale identity');if(!document.querySelector('img[alt="Karakter tetap Flow"]')?.naturalWidth)throw Error('Character preview missing')})()`, shot: path.join(dir, 'selected.png') },
  { main: 'mockStyleUpload' },
  { js: click('Upload karakter & gaya'), wait: 600 },
  { js: `(async()=>{const s=await window.api.settings.get();if(s.channelCharacterReference!==s.channelStyleReference||s.channelCharacterReference===window.savedStyle)throw Error('Combined upload failed');window.selectedCharacter=s.channelCharacterReference;if(s.channelCharacterDescription.includes('Kenzo')||s.channelStyleDescription.includes('Kenzo'))throw Error('Stale descriptions')})()` },
  { js: click('Upload karakter & gaya'), wait: 300 },
  { js: `(async()=>{if((await window.api.settings.get()).channelCharacterReference!==window.selectedCharacter)throw Error('Cancel changed selection')})()` },
  { js: click('Pakai preset di Flow'), wait: 350 },
  { js: `(async()=>{const s=await window.api.settings.get();if(s.channelStyleEnabled||!s.channelCharacterEnabled||s.channelCharacterReference!==window.selectedCharacter)throw Error('Preset removed character');const p=document.querySelector('[aria-label="Pilih gaya visual"]');const r=p.getBoundingClientRect();if(r.left<0||r.right>innerWidth||r.bottom>innerHeight)throw Error('Panel outside viewport');const b=[...p.querySelectorAll('button')].find(b=>b.textContent.includes('Upload karakter'));if(b.getBoundingClientRect().bottom>r.bottom)throw Error('Upload clipped')})()`, shot: path.join(dir, 'preset.png') },
  { js: `document.querySelector('[aria-label="Gaya visual"][role="radiogroup"] button[aria-checked="false"]').click()`, wait: 250 }, openMenu,
  { js: `(async()=>{if((await window.api.settings.get()).channelCharacterReference!==window.selectedCharacter)throw Error('Preset change reset character');console.log('CHANNEL VISUAL UI PASS: style-only upload, promote existing style to character, combined upload, canceled dialog, preset switch preserves identity, visible previews and controls at 1180x720')})()`, quit: true }
], 'CHANNEL VISUAL UI PASS');
console.log('Evidence: ' + dir);
