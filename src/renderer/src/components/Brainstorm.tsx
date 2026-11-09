import type { ContentFormat } from '@shared/contentFormat'
import { useEffect, useRef, useState } from 'react'
import type { BrainstormIdea } from '@shared/brainstorm'
import { IDEA_TOPICS, LANGUAGES } from '@shared/models'
import { Button, Modal, inputCls } from './ui'
import { errorText } from '../lib/format'

export function Brainstorm({category,language,format,onClose,onPick,onBusy}:{category:string|null;language:string;format:ContentFormat;onClose:()=>void;onPick:(idea:BrainstormIdea)=>void;onBusy:(busy:boolean)=>void}):React.JSX.Element {
  const [direction,setDirection]=useState(''),[ideas,setIdeas]=useState<BrainstormIdea[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
  const revision=useRef(0),seen=useRef<string[]>([])
  useEffect(()=>{revision.current++;setIdeas([]);setError(null);setDirection('');setBusy(false);onBusy(false);seen.current=[]},[category,language,format])
  const run=async():Promise<void>=>{
    if(!category||busy)return
    const version=++revision.current
    setBusy(true);onBusy(true);setError(null)
    try{const rows=await window.api.story.brainstorm(category,language,direction,seen.current.slice(-60),format);if(version!==revision.current)return;setIdeas(rows);seen.current.push(...rows.map(r=>r.title))}
    catch(e){if(version===revision.current)setError(errorText(e))}
    finally{if(version===revision.current){setBusy(false);onBusy(false)}}
  }
  const close=():void=>{revision.current++;setBusy(false);onBusy(false);onClose()}
  return <Modal open={!!category} onClose={close} title={'Brainstorm ide · '+(IDEA_TOPICS.find(t=>t.id===category)?.label??'')} subtitle={format==='short'?'Short · satu pertanyaan spesifik yang bisa dijawab tuntas.':'Long · masalah yang dekat, sudut spesifik, dan perkembangan yang layak diikuti.'} width={1000}>
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold">Bahasa hasil: {LANGUAGES.find(l=>l.code===language)?.label ?? language}</p>
      <label className="flex flex-col gap-1 text-sm">Arahan tambahan (opsional)<textarea aria-label="Arahan brainstorming" className={inputCls} maxLength={1800} rows={2} value={direction} disabled={busy} onChange={e=>setDirection(e.target.value)} placeholder="Misalnya: pekerja muda dan orang berkeluarga; tekanan gaji, cicilan, orang tua, dan biaya anak. Cari sudut yang tidak pasaran tanpa mengarang fakta." /></label>
      <p className="text-xs text-muted">Ide berasal dari model penulis. Relevansi dan kebaruan masih hipotesis; belum memeriksa seberapa sering topik dibahas di YouTube. Periksa sumber sebelum produksi. Memakai kuota model pilihanmu.</p>
      <Button variant="primary" loading={busy} onClick={()=>void run()}>{ideas.length?'Cari sudut lain':'Cari 6 sudut pembahasan'}</Button>
      {busy&&<p role="status" className="text-sm">Sedang mencari kandidat, pembuka dan arah penjelasan sesuai bahasa pilihanmu. Batas waktu tiga menit.</p>}
      {error&&<p role="alert" className="rounded-lg bg-bad-soft p-3 text-sm text-bad-ink">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2">{ideas.map((idea,i)=><article key={idea.title} className="flex flex-col gap-2 rounded-xl border border-line p-4 text-sm">
        <strong>{i+1}. {idea.title}</strong><p className="text-xs text-muted"><b>Buat siapa:</b> {idea.audience}</p><p>{idea.angle}</p><p className="rounded-lg bg-accent-soft p-2"><b>Pembuka:</b> {idea.hook}</p><p className="text-ink-2">{idea.synopsis}</p><p className="rounded-lg border border-line p-2"><b>Pertanyaan penutup:</b> {idea.cta}</p><details><summary className="cursor-pointer text-xs font-semibold">Kerangka · perkiraan {idea.estimatedSec<120?idea.estimatedSec+' detik':Math.round(idea.estimatedSec/60*10)/10+' menit'}</summary><ol className="mt-2 list-decimal space-y-1 pl-4 text-xs">{idea.outline.map((s,j)=><li key={j}>{s}</li>)}</ol></details><p className="text-xs text-muted">Kenapa layak dicoba: {idea.why}</p>
        <details><summary className="cursor-pointer text-xs font-semibold">Yang perlu diriset</summary><ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{idea.checks.map((s,j)=><li key={j}>{s}</li>)}</ul></details>
        <Button size="sm" disabled={busy} onClick={()=>onPick(idea)}>Pakai ide ini</Button>
      </article>)}</div>
    </div>
  </Modal>
}
