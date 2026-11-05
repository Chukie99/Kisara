import { flowSetup } from './flow2api'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { FlowProfile } from '@shared/production'
import { dataDir } from '../paths'
import { getSettings } from '../settings'
import { requireSecret } from '../secrets'
import { ensureLocalFlow } from './flowLocal'

const children = new Map<string, ChildProcess>()
const states = new Map<string, FlowProfile>()
const store = (): string => join(dataDir(),'flow-profiles.json')
function profiles(): FlowProfile[] {
  try { const items=JSON.parse(readFileSync(store(),'utf8')) as FlowProfile[];return Array.isArray(items)?items.filter(p=>p&&/^[a-f0-9-]{36}$/.test(p.id)&&typeof p.email==='string'&&p.routeKey==='kisara-'+p.id).slice(0,20):[] } catch {return []}
}
export function flowProfiles(): FlowProfile[] {return profiles().map(p=>states.get(p.id)??{...p,status:'closed',message:'Buka browser akun ini untuk menyambungkan kembali.'})}

/** Build one combined connector per isolated profile; credentials are injected into browser storage in memory. */
export async function openFlowProfile(email: string): Promise<FlowProfile> {
  if(typeof email!=='string')throw new Error('Isi email akun Google yang valid.')
  email=email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new Error('Isi email akun Google yang valid.')
  const settings=getSettings()
  if(settings.flowBaseUrl!=='http://127.0.0.1:8765')throw new Error('Tambah akun otomatis memakai instalasi Flow lokal Kisara di port 8765.')
  await ensureLocalFlow(settings.flowBaseUrl)
  const root=app.getAppPath(),python=join(root,'tools/flow2api/venv/Scripts/python.exe')
  if(!existsSync(python))throw new Error('Instalasi browser Flow lokal belum tersedia.')
  const items=profiles();let profile=items.find(p=>p.email===email)
  if(!profile){if(items.length>=20)throw new Error('Maksimal 20 profil browser tersimpan.');const id=randomUUID();profile={id,email,routeKey:'kisara-'+id,status:'starting',message:'Menyiapkan browser akun…'};items.push(profile);mkdirSync(dataDir(),{recursive:true});writeFileSync(store(),JSON.stringify(items))}
  if(children.has(profile.id))return states.get(profile.id)??profile
  try {
    const setup=await flowSetup()
    if(setup.workers.some(w=>w.routeKey===profile!.routeKey)){
      const paired=setup.accounts.some(a=>a.email.toLowerCase()===email&&a.routeKey===profile!.routeKey&&a.workerConnected)
      const state={...profile,status:paired?'ready' as const:'login' as const,message:paired?'Browser akun ini sudah tersambung. Gunakan jendela browser yang masih terbuka.':'Browser akun ini sudah terbuka. Selesaikan login di jendela tersebut.'}
      states.set(profile.id,state);return state
    }
  } catch {/* A fresh local browser may still connect while the setup endpoint is warming up. */}
  const base=join(dataDir(),'flow-browsers',profile.id),extension=join(base,'connector')
  mkdirSync(extension,{recursive:true})
  const worker=join(root,'tools/flow2api/extension'),updater=join(root,'tools/flow2api-token-updater')
  for(const file of readdirSync(worker))if(/\.(js|html|json)$/.test(file)&&file!=='manifest.json')copyFileSync(join(worker,file),join(extension,file))
  for(const file of readdirSync(updater))if(/\.(js|html|png)$/.test(file)&&file!=='background.js')copyFileSync(join(updater,file),join(extension,file))
  const workerCode=readFileSync(join(worker,'background.js'),'utf8')
  const updaterCode=readFileSync(join(updater,'background.js'),'utf8')
  writeFileSync(join(extension,'background.js'),'(()=>{\n'+workerCode+'\n})();\n(()=>{\n'+updaterCode+'\nglobalThis.kisaraSync=runTokenSync;globalThis.kisaraConfigure=async c=>{await saveConfig(c);await setupAlarm()};\n})();')
  const manifest=JSON.parse(readFileSync(join(worker,'manifest.json'),'utf8'))
  manifest.name='Kisara · Akun Google Flow';manifest.permissions=['storage','tabs','scripting','cookies','alarms','notifications'];manifest.host_permissions=['https://labs.google/*','https://flow.google.com/*','https://*.google.com/*','http://127.0.0.1/*'];manifest.action={default_title:'Pengaturan akun Flow',default_popup:'popup.html'}
  writeFileSync(join(extension,'manifest.json'),JSON.stringify(manifest))
  const state={...profile,status:'starting' as const,message:'Menyiapkan browser akun…'};states.set(profile.id,state)
  const key=requireSecret('flow2api')
  const child=spawn(python,[join(root,'tools/flow-managed-browser.py')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});children.set(profile.id,child)
  child.stdin!.end(JSON.stringify({root,profile:join(base,'profile'),extension,email,key,base:settings.flowBaseUrl,routeKey:profile.routeKey})+'\n')
  let buffer=''
  child.stdout!.on('data',(chunk:Buffer)=>{buffer+=chunk.toString();if(buffer.length>65536)buffer='';const lines=buffer.split(/\r?\n/);buffer=lines.pop()??'';for(const line of lines){try{const message=JSON.parse(line);if(['login','ready','closed','error'].includes(message.status)&&typeof message.message==='string')states.set(profile!.id,{...profile!,status:message.status,message:message.message.slice(0,500)})}catch{/* Ignore non-protocol output without logging credentials. */}}})
  child.stderr!.on('data',()=>{})
  child.on('error',()=>{children.delete(profile!.id);states.set(profile!.id,{...profile!,status:'error',message:'Browser gagal dijalankan. Periksa instalasi Flow lokal.'})})
  child.on('exit',code=>{children.delete(profile!.id);if(states.get(profile!.id)?.status!=='error')states.set(profile!.id,{...profile!,status:code?'error':'closed',message:code?'Browser akun terhenti. Buka lagi untuk mencoba.':'Browser akun ditutup.'})})
  return state
}
