const { buildSync } = require('esbuild'), assert = require('node:assert/strict'), path = require('node:path');
buildSync({ entryPoints: ['src/shared/speech.ts'], bundle: true, platform: 'node', outfile: 'tmp/bugcheck/speaker-label-tests.cjs' });
const f = require(path.resolve('tmp/bugcheck/speaker-label-tests.cjs'));
const clean = text => f.stripSpeakerLabels(text, ['Kenzo','Ibu','Dr. Kenzo']);
for (const [raw, expected] of [
 ['Narator: Sisihkan uang.', 'Sisihkan uang.'],
 ['Narrator: Save first.', 'Save first.'],
 ['Kenzo: Mulai sedikit.', 'Mulai sedikit.'],
 ['Narator, “Ketelitian itu penting.”', '“Ketelitian itu penting.”'],
 ['Kenzo, <sad> “Aku ingin menabung.”', '<sad> “Aku ingin menabung.”'],
 ['<short pause> Kenzo: Mulai sedikit.', '<short pause> Mulai sedikit.'],
 ['Sudah waktunya. Kenzo, “Mulai sekarang.”', 'Sudah waktunya. “Mulai sekarang.”'],
 ['Narator: Budi duduk.\nKenzo: Aku siap.\nIbu: Bagus.', 'Budi duduk.\nAku siap.\nBagus.'],
 ['**Kenzo:** Mulai sekarang.', 'Mulai sekarang.'],
 ['Dr. Kenzo: Periksa syaratnya.', 'Periksa syaratnya.'],
 ['Kenzo sedang menabung untuk keluarganya.', 'Kenzo sedang menabung untuk keluarganya.'],
 ['Beri tahu Kenzo, “Aku sudah siap.”', 'Beri tahu Kenzo, “Aku sudah siap.”'],
 ['“Kenzo, tolong bantu Ibu.”', '“Kenzo, tolong bantu Ibu.”'],
 ['Narator mengatakan bahwa Kenzo sudah siap.', 'Narator mengatakan bahwa Kenzo sudah siap.'],
 ['Perbandingannya 2:1 dan waktunya 10:30.', 'Perbandingannya 2:1 dan waktunya 10:30.'],
 ['DrX Kenzo: Keep this literal name.', 'DrX Kenzo: Keep this literal name.'],
 ['Unknown: Jangan hilangkan nama yang tidak dikenal.', 'Unknown: Jangan hilangkan nama yang tidak dikenal.']
]) assert.equal(clean(raw), expected, raw);
const line = f.composeSceneSpeech('Narator: Kenzo membuka catatan.', [{speaker:'Kenzo',text:'Mulai dari seribu rupiah.',emotion:'whispers'}], true);
assert.equal(line, 'Kenzo membuka catatan. <whispers> “Mulai dari seribu rupiah.”');
assert(!line.includes('Kenzo,'));
assert.equal(f.composeSceneSpeech('Ia berkata, “Aku siap.”', [{speaker:'Kenzo',text:'Aku siap.'}], false), 'Ia berkata, “Aku siap.”');
assert.equal(f.stripVoiceTags(clean('Kenzo, <sad> “Aku ingin menabung.”')), '“Aku ingin menabung.”');
console.log('SPEAKER LABELS PASS: narrator/known character headings removed; vocal tags, dialogue, natural names and numerical colons preserved.');
