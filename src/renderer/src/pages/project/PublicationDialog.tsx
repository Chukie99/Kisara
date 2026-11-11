import { useEffect, useState } from 'react'
import { publicationDraft, publicationHashtags, publicationSource, publicationText } from '@shared/publication'
import type { PublicationMetadata } from '@shared/types'
import { Button, Modal, inputCls } from '../../components/ui'
import { errorText } from '../../lib/format'
import { useApp } from '../../store/app'
import { useProject } from '../../store/project'

export function PublicationDialog({open,onClose}:{open:boolean;onClose:()=>void}) {
  const {project,clips,updateEditor,flush}=useProject()
  const {toast}=useApp()
  const [thumbnailBusy,setThumbnailBusy]=useState(false)
  const [busy,setBusy]=useState(false),[tags,setTags]=useState('')
  const metadata=project?(project.editor.publication || publicationDraft(project,clips)):null
  useEffect(()=>{if(open)setTags(metadata?.hashtags.join(' ') || '')},[open,project?.id])
  if(!project||!metadata)return null
  const source=publicationSource(project,clips),stale=metadata.source!==source
  const thumbnailStale = !!metadata.thumbnail && ((metadata.thumbnail.source ?? metadata.source) !== source || (!!metadata.thumbnail.sourceTitle && metadata.thumbnail.sourceTitle !== metadata.title))
  const write=(patch:Partial<PublicationMetadata>)=>updateEditor({publication:{...metadata,...patch,source:patch.thumbnail?metadata.source:source,origin:'edited'}})
  const copy=async(text:string)=>{try{await window.api.app.copyText(text);toast('success','Disalin.')}catch(e){toast('error',errorText(e))}}
  const generate=async()=>{
    setBusy(true)
    try{
      await flush()
      const value=await window.api.story.publication(project.id),current=useProject.getState()
      if(current.project?.id!==project.id||publicationSource(current.project,current.clips)!==value.source)throw new Error('Naskah berubah; paket publikasi belum diterapkan.')
      current.updateEditor({publication:value});setTags(value.hashtags.join(' '));await current.flush()
      toast('success','Paket publikasi dan konsep thumbnail siap.')
    }catch(e){toast('error',errorText(e))}finally{setBusy(false)}
  }
  const generateOneThumbnail = async (): Promise<void> => {
    const id = project.id, title = metadata.title
    setThumbnailBusy(true)
    try {
      await flush()
      const result = await window.api.story.thumbnail(id, title), current = useProject.getState()
      if (!current.project || current.project.id !== id || publicationSource(current.project, current.clips) !== result.source) throw new Error('Naskah berubah; prompt thumbnail belum diterapkan.')
      const currentMetadata = current.project.editor.publication ?? publicationDraft(current.project, current.clips)
      if (currentMetadata.title !== title) throw new Error('Judul berubah; buat prompt thumbnail dari judul terbaru.')
      current.updateEditor({ publication: { ...currentMetadata, thumbnail: result.thumbnail } }); await current.flush()
      toast('success', 'Satu prompt thumbnail siap disalin. Judul dan deskripsi kamu tetap tersimpan.')
    } catch (error) { toast('error', errorText(error)) } finally { setThumbnailBusy(false) }
  }
  return <Modal open={open} onClose={onClose} title="Publikasi & thumbnail" subtitle="Paket publikasi untuk video ini. Kamu bisa mengedit sebelum mengunggah." width={720}>
    {stale&&<p role="alert" className="rounded-lg bg-sun-soft p-3 text-sm text-sun-ink">Naskah sudah berubah. Perbarui paket ini agar sesuai isi video terbaru.</p>}
    {metadata.origin==='draft'&&<p className="text-sm text-muted">Ini draf dari naskah. Klik Buat paket SEO untuk menyusun judul, deskripsi dan hashtag dengan AI.</p>}
    <details className="rounded-lg border border-line p-3" open>
      <summary className="cursor-pointer text-sm font-semibold">Satu prompt thumbnail untuk janji klik</summary>
      <div className="mt-3 flex flex-wrap items-center gap-3"><Button size="sm" variant="primary" loading={thumbnailBusy} disabled={busy || !clips.length} onClick={()=>void generateOneThumbnail()}>{metadata.thumbnail?'Perbarui 1 prompt thumbnail':'Buat 1 prompt thumbnail'}</Button><p className="text-xs text-muted">Satu konsep yang melengkapi judul dan sesuai isi video. Memakai model penulis pilihanmu; belum membuat gambar.</p></div>
      {thumbnailStale && <p role="alert" className="mt-2 text-xs text-sun-ink">Judul atau naskah sudah berubah. Perbarui prompt thumbnail sebelum menyalinnya.</p>}
      {metadata.thumbnail ? <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-2 text-sm">Teks thumbnail<input aria-label="Teks thumbnail" className={inputCls} maxLength={60} value={metadata.thumbnail.headline} disabled={busy||thumbnailBusy} onChange={e=>write({thumbnail:{...metadata.thumbnail!,headline:e.target.value}})}/></label>
        <label className="flex flex-col gap-2 text-sm">Konsep visual<textarea aria-label="Konsep thumbnail" className={inputCls+' min-h-[80px] py-3'} maxLength={1500} value={metadata.thumbnail.concept} disabled={busy||thumbnailBusy} onChange={e=>write({thumbnail:{...metadata.thumbnail!,concept:e.target.value}})}/></label>
        <label className="flex flex-col gap-2 text-sm">Prompt thumbnail<textarea aria-label="Prompt thumbnail" className={inputCls+' min-h-[120px] py-3'} maxLength={5000} value={metadata.thumbnail.prompt} disabled={busy||thumbnailBusy} onChange={e=>write({thumbnail:{...metadata.thumbnail!,prompt:e.target.value}})}/></label>
        <Button size="sm" className="self-start" disabled={thumbnailStale||thumbnailBusy} onClick={()=>void copy(metadata.thumbnail!.prompt)}>Salin prompt thumbnail</Button>
        <p className="text-xs text-muted">Ini rancangan, belum berupa gambar. Salin prompt ke pembuat gambar dan lampirkan referensi karakter. Untuk cover Shorts, ubah format menjadi 9:16 sebelum membuat gambar.</p>
      </div> : <p className="mt-3 text-sm text-muted">Klik Buat 1 prompt thumbnail. AI memilih satu konflik atau rasa penasaran yang benar-benar dijawab video.</p>}
    </details>
    <label className="flex flex-col gap-2 text-sm font-semibold">Judul YouTube <span className="text-xs font-normal text-muted">{metadata.title.length}/100 karakter</span><input aria-label="Judul YouTube" className={inputCls} maxLength={100} value={metadata.title} disabled={busy||thumbnailBusy} onChange={e=>write({title:e.target.value})}/></label>
    <Button size="sm" className="self-start" onClick={()=>void copy(metadata.title)}>Salin judul</Button>
    <label className="flex flex-col gap-2 text-sm font-semibold">Deskripsi<textarea aria-label="Deskripsi video" className={inputCls+' min-h-[150px] resize-y py-3 font-normal'} maxLength={5000} value={metadata.description} disabled={busy||thumbnailBusy} onChange={e=>write({description:e.target.value})}/></label>
    <Button size="sm" className="self-start" onClick={()=>void copy(metadata.description)}>Salin deskripsi</Button>
    <label className="flex flex-col gap-2 text-sm font-semibold">Hashtag<input aria-label="Hashtag video" className={inputCls} value={tags} disabled={busy||thumbnailBusy} onChange={e=>setTags(e.target.value)} onBlur={()=>{const hashtags=publicationHashtags(tags.split(/\s+/));write({hashtags});setTags(hashtags.join(' '))}}/><span className="text-xs font-normal text-muted">Maksimal 5 hashtag yang relevan, dipisahkan spasi.</span></label>

    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={()=>void copy(publicationHashtags(tags.split(/\s+/)).join(' '))}>Salin hashtag</Button>
      <Button size="sm" disabled={stale||thumbnailStale||busy||thumbnailBusy} onClick={()=>void copy(publicationText({...metadata,hashtags:publicationHashtags(tags.split(/\s+/))}))}>Salin semua</Button>
      <Button size="sm" disabled={stale||thumbnailStale||busy||thumbnailBusy} onClick={()=>void(async()=>{try{await flush();const file=await window.api.story.exportPublication(project.id);if(file)toast('success','Paket publikasi TXT tersimpan.')}catch(e){toast('error',errorText(e))}})()}>Simpan TXT</Button>
      <Button size="sm" variant="primary" loading={busy} disabled={!clips.length||thumbnailBusy} onClick={()=>void generate()}>{metadata.origin==='draft'?'Buat paket SEO':'Perbarui paket SEO'}</Button>
    </div>
    <p className="text-xs text-muted">Kata kunci mengikuti topik dan naskah. Paket ini tidak mengukur volume pencarian atau menjamin peringkat maupun jumlah penonton.</p>
  </Modal>
}
