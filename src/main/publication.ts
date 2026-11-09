import { HOOK_DIRECTION } from '@shared/storyDirection'
import { publicationMetadata, publicationSource } from '@shared/publication'
import type { PublicationMetadata } from '@shared/types'
import { getBundle } from './repo'
import { getSettings } from './settings'
import { generateJson } from './services/llm'

export const PUBLICATION_SCHEMA = {
  type:'object',additionalProperties:false,
  properties:{title:{type:'string',description:'Frontal, specific and honest click promise in the video language. Confront the recognizable contradiction or tradeoff that the actual video answers. Prefer 45-70 characters, maximum 100; main topic near the start.'},description:{type:'string',description:'A specific natural description grounded in this video. Put its main topic in the first two lines, summarize what the viewer learns. No invented claims, prices, guarantees, links, dates or search-volume claims. No hashtags inside this field.'},hashtags:{type:'array',minItems:3,maxItems:5,items:{type:'string'},description:'Three to five distinct relevant hashtags, each a single #word. No unrelated trending terms or generic viral promises.'},thumbnail:{type:'object',additionalProperties:false,properties:{headline:{type:'string',description:'2-5 words in the video language, maximum 60 characters, legible on mobile and accurate to the script.'},concept:{type:'string',description:'Concise composition: one clear action or reaction, expressive main character, one story object, simple high-contrast background. Maximum 1500 characters.'},prompt:{type:'string',description:'Standalone image generation prompt, maximum 5000 characters. Specify landscape 16:9 thumbnail, exact headline, main character identity from supplied reference, composition, safe margins, contrast and matching visual style. No unsupported prices or claims. No other text or watermarks.'}},required:['headline','concept','prompt']}},required:['title','description','hashtags','thumbnail']
}
export const PUBLICATION_DIRECTION = HOOK_DIRECTION+' Also write publication metadata in the video language: an accurate searchable title with the primary topic naturally near the start, a unique description summarizing only this video with its main topic in the opening lines, and 3-5 relevant hashtags. Do not keyword-stuff, invent links, promise ranking or virality, call something fraud without evidence, or make finance claims stronger than the script. Include a thumbnail headline, composition concept and standalone image prompt: 2-5 words, one expressive character reacting or acting with a meaningful story object, simple background, clear at small size, accurate to the video. Honor supplied character identity and project visual style; do not default to a presenter pointing at charts. Never promise clicks.'

export async function generatePublication(projectId: string): Promise<PublicationMetadata> {
  const b=getBundle(projectId),source=publicationSource(b.project,b.clips)
  if(!b.clips.length)throw new Error('Susun naskah dulu supaya judul dan deskripsinya sesuai isi video.')
  const settings=getSettings()
  const value=await generateJson<unknown>({system:'You write publication metadata for YouTube videos. '+PUBLICATION_DIRECTION,prompt:JSON.stringify({language:b.project.language,title:b.project.title,synopsis:b.project.synopsis,format:b.project.editor.contentFormat,visualStyle:b.project.styleId,mainCharacter:settings.channelCharacterEnabled?{name:settings.channelCharacterName,description:settings.channelCharacterDescription}:undefined,styleReference:settings.channelStyleEnabled?settings.channelStyleDescription:undefined,characters:b.characters?.map(c=>({name:c.name,description:c.description})),unresolvedChecks:b.project.editor.storyBrief?.reviewNotes,scenes:b.clips.map(c=>({title:c.title,narration:c.narration}))}),schema:PUBLICATION_SCHEMA,name:'video-publication'})
  const latest=getBundle(projectId)
  if(publicationSource(latest.project,latest.clips)!==source)throw new Error('Naskah berubah saat paket publikasi disusun. Buat ulang agar sesuai isi terbaru.')
  const metadata=publicationMetadata(value,b.project,b.clips)
  if(metadata.origin!=='ai'||!metadata.thumbnail)throw new Error('Paket publikasi belum lengkap. Draf dan edit kamu tetap disimpan; coba susun lagi.')
  return metadata
}
