import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { buildFlowPlan, flowText, flowNarrationText, flowAgentBatch, flowImageMapText, flowReady } from '@shared/flow'
import type { FlowExportOptions, ProjectBundle } from '@shared/types'

export async function flowExportBytes(bundle: ProjectBundle, format: 'txt' | 'docx', options: FlowExportOptions = {}): Promise<Buffer> {
  const plan = buildFlowPlan(bundle)
  const kind = options.kind ?? 'guide'
  if (!plan.scenes.length) throw new Error('Susun naskah dulu sebelum mengekspor panduan Flow.')
  if (kind === 'guide' && plan.scenes.some((scene) => !flowReady(scene, plan.mode))) throw new Error('Ada narasi kosong atau prompt yang belum sesuai naskah. Susun/perbarui prompt dahulu.')
  const text = kind === 'narration' ? flowNarrationText(plan) : kind === 'agent' ? flowAgentBatch(plan, options.batchIndex ?? 0) : kind === 'mapping' ? flowImageMapText(plan) : flowText(plan)
  if (format === 'txt') return Buffer.from(text, 'utf8')
  const children = text.split('\n').map((line, i) => {
    const scene = kind === 'guide' && /^\d+ · \[/.test(line)
    const label = kind === 'guide' && ['SINOPSIS', 'NARASI', 'PROMPT GAMBAR', 'PROMPT IMAGE TO VIDEO'].includes(line)
    return new Paragraph({
      heading: kind === 'guide' ? i === 0 ? HeadingLevel.TITLE : scene ? HeadingLevel.HEADING_1 : undefined : undefined,
      keepNext: scene || label,
      spacing: { after: line ? 100 : 60 },
      children: [new TextRun({ text: line, bold: label, color: label ? '3977F6' : undefined })]
    })
  })
  return Packer.toBuffer(new Document({ creator: 'Kisara', title: plan.title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { line: 276 } } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }]
  }))
}
