import type { ContentFormat, FormatPlan } from '@shared/contentFormat'
import { matchingFormatPlan } from '@shared/contentFormat'
import { cx } from './ui'
export function FormatChoice({value,onChange,disabled=false}:{value:ContentFormat;onChange:(value:ContentFormat)=>void;disabled?:boolean}):React.JSX.Element {
  return <div aria-label="Jenis konten" className="grid grid-cols-2 gap-3">{([{id:'short',label:'Short',detail:'Satu pertanyaan, satu penjelasan tuntas.'},{id:'long',label:'Long',detail:'Pembahasan bertahap dengan ruang untuk konteks dan contoh.'}] as const).map(f=><button key={f.id} type="button" disabled={disabled} aria-pressed={value===f.id} onClick={()=>onChange(f.id)} className={cx('rounded-xl border p-4 text-left disabled:opacity-50',value===f.id?'border-accent bg-accent-soft':'border-line bg-surface hover:border-ink-2')}><strong className="block">{f.label}</strong><span className="mt-1 block text-xs text-muted">{f.detail}</span></button>)}</div>
}
export function FormatOutline({plan,format,synopsis}:{plan?:FormatPlan;format:ContentFormat;synopsis:string}):React.JSX.Element|null {
  if(!plan)return null
  const current=matchingFormatPlan(plan,format,synopsis)
  if(!current)return <p className="text-xs text-muted">Ide atau format berubah. Kerangka dan perkiraan akan disusun ulang sebelum menulis naskah.</p>
  const seconds=plan.estimatedSec
  return <section aria-label="Kerangka dan perkiraan" className="rounded-xl border border-line bg-paper p-3 text-sm"><p>Perkiraan berdasarkan kerangka: <strong>{seconds<120?seconds+' detik':Math.round(seconds/60*10)/10+' menit'}</strong>. Durasi akhir mengikuti suara narator.</p><details className="mt-2"><summary className="cursor-pointer font-medium">Lihat urutan pembahasan ({plan.outline.length} bagian)</summary><ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-2">{plan.outline.map((s,i)=><li key={i}>{s}</li>)}</ol></details></section>
}
