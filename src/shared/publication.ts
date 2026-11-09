import type { Clip, Project, PublicationMetadata } from './types'
import { stripVoiceTags } from './speech'

type SourceProject = Pick<Project, 'title' | 'synopsis' | 'language'> & Partial<Pick<Project,'aspectRatio'|'editor'>>
type SourceClip = Pick<Clip, 'title' | 'narration' | 'story'>

export function publicationSource(project: SourceProject, clips: SourceClip[]): string {
  return JSON.stringify([2, project.title, project.synopsis, project.language, project.aspectRatio, project.editor?.contentFormat, clips.map(c=>[c.title,c.story,c.narration])])
}

export function publicationHashtags(value: unknown): string[] {
  if(!Array.isArray(value))return []
  return [...new Map(value.filter((s): s is string=>typeof s==='string').flatMap(s=>s.split(/\s+/)).map(s=>'#'+s.replace(/^#+/,'').replace(/[^\p{L}\p{N}_]/gu,'')).filter(s=>s.length>1&&s.length<=65).map(s=>[s.toLocaleLowerCase(),s])).values()].slice(0,5)
}

/** A draft remains available without an LLM request, but is labelled clearly in the UI. */
export function publicationDraft(project: SourceProject, clips: SourceClip[]): PublicationMetadata {
  const description=clips.map(c=>stripVoiceTags(c.narration).trim()).filter(Boolean).join(' ').slice(0,1200) || project.synopsis.trim().slice(0,1200)
  return {title:project.title.trim().slice(0,100),description,hashtags:[],source:publicationSource(project,clips),origin:'draft'}
}

export function publicationMetadata(value: unknown, project: SourceProject, clips: SourceClip[]): PublicationMetadata {
  const draft=publicationDraft(project,clips)
  if(!value||typeof value!=='object')return draft
  const p=value as Partial<PublicationMetadata>
  const title=typeof p.title==='string'?p.title.replace(/[\r\n]+/g,' ').trim():''
  const description=typeof p.description==='string'?p.description.trim():''
  const hashtags=publicationHashtags(p.hashtags)
  if(!title||title.length>100||!description||description.length>5000||hashtags.length<3)return draft
  const t=p.thumbnail
  const thumbnail=t&&typeof t.headline==='string'&&typeof t.concept==='string'&&typeof t.prompt==='string'
    &&t.headline.trim()&&t.headline.trim().length<=60&&t.concept.trim()&&t.concept.trim().length<=1500&&t.prompt.trim()&&t.prompt.trim().length<=5000
    ?{headline:t.headline.trim(),concept:t.concept.trim(),prompt:t.prompt.trim()}:undefined
  return {...draft,title,description,hashtags,thumbnail,origin:'ai'}
}

export function publicationText(p: PublicationMetadata): string {
  return `JUDUL\n${p.title}\n\nDESKRIPSI\n${p.description}\n\nHASHTAG\n${p.hashtags.join(' ')}\n${p.thumbnail?`\nTHUMBNAIL\nTeks: ${p.thumbnail.headline}\n\nKonsep: ${p.thumbnail.concept}\n\nPROMPT THUMBNAIL\n${p.thumbnail.prompt}\n`:''}`
}
