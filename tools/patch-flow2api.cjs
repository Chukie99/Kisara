/** Restore the local, version-checked Flow2API policy after an upstream checkout. */
const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.join(__dirname,'flow2api'),patch=path.join(__dirname,'flow2api-kisara.patch');
try{cp.execFileSync('git',['apply','--check',patch],{cwd:root,stdio:'pipe'});cp.execFileSync('git',['apply',patch],{cwd:root,stdio:'pipe'});}catch(e){try{cp.execFileSync('git',['apply','--reverse','--check',patch],{cwd:root,stdio:'pipe'});}catch{throw new Error('Versi Flow2API berbeda. Patch tidak diterapkan; periksa perubahan upstream terlebih dahulu.')}}
fs.copyFileSync(path.join(__dirname,'flow2api-policy.py'),path.join(root,'src/services/kisara_policy.py'));fs.copyFileSync(path.join(__dirname,'flow2api-kisara-routes.py'),path.join(root,'src/api/kisara_routes.py'));console.log('Patch kebijakan Kisara siap. Mulai ulang server Flow2API.');
