import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { binPath, dataDir } from '../paths'
import { runMediaProcess } from './mediaProcess'

/** A browser may return WebM; store actual H.264 MP4 so preview and export decode the same file. */
export async function normalizeFlowVideo(bytes: Buffer, signal: AbortSignal): Promise<Buffer> {
  const dir = join(dataDir(), 'tmp')
  mkdirSync(dir, {recursive:true})
  const id=randomUUID(), source=join(dir,id+'.input'), target=join(dir,id+'.mp4')
  try {
    signal.throwIfAborted()
    writeFileSync(source,bytes)
    await runMediaProcess(binPath(ffmpegStatic!),['-y','-v','error','-i',source,'-map','0:v:0','-map','0:a?','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',target],{signal,name:'Konversi video Flow',maxBuffer:1024*1024,timeoutMs:180000})
    return readFileSync(target)
  } finally { rmSync(source,{force:true});rmSync(target,{force:true}) }
}
