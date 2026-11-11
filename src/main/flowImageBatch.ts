/** Keep a group resident until every known result is consumed; never route partial failures to a new account. */
export interface BatchImageRequest { id: string; prompt: string; aspect: '16:9'|'9:16'; references: Buffer[]; fingerprint: string; identityKey: string }
export type BatchImageResult = { id: string; bytes?: Buffer; error?: string; skipped?: boolean }
export class FlowImageBatch {
  private requests = new Map<string,BatchImageRequest>()
  private results = new Map<string,BatchImageResult>()
  private loaded = new Set<number>()
  private stopped = false
  constructor(private ids:string[],private prepare:(id:string)=>BatchImageRequest,private send:(requests:BatchImageRequest[],signal:AbortSignal)=>Promise<BatchImageResult[]>,private size=10) {
    if(size<1||size>10||!Number.isInteger(size)||new Set(ids).size!==ids.length)throw new Error('Antrean gambar tidak valid.')
  }
  canDrain(id:string):boolean {
    const result=this.results.get(id)
    // Keep the actual failed row visible; only tasks the worker never attempted are canceled.
    return !this.stopped||!!result&&!result.skipped
  }
  request(id:string):BatchImageRequest {
    const index=this.ids.indexOf(id)
    if(index<0)throw new Error('Klip tidak ada dalam antrean.')
    const group=Math.floor(index/this.size)
    if(!this.loaded.has(group)) {
      if(this.stopped)throw new Error('Antrean dihentikan setelah kegagalan sebelumnya.')
      const rows=this.ids.slice(group*this.size,(group+1)*this.size).map(this.prepare)
      for(const row of rows)this.requests.set(row.id,row)
      this.loaded.add(group)
    }
    return this.requests.get(id)!
  }
  async image(id:string,signal:AbortSignal):Promise<Buffer> {
    const request=this.request(id)
    if(!this.results.has(id)) {
      if(this.stopped)throw new Error('Antrean dihentikan setelah kegagalan sebelumnya.')
      const index=this.ids.indexOf(id),group=Math.floor(index/this.size)
      const ids=this.ids.slice(group*this.size,(group+1)*this.size)
      try {
        const results=await this.send(ids.map(key=>this.requests.get(key)!),signal)
        const seen=new Set<string>()
        for(const result of results) {
          if(!ids.includes(result.id)||seen.has(result.id)||!!result.bytes===!!result.error)throw new Error('Pemetaan hasil batch Flow tidak valid; hasil belum dipasang.')
          seen.add(result.id)
        }
        if(seen.size!==ids.length)throw new Error('Hasil batch Flow belum lengkap; permintaan tidak diulang.')
        for(const result of results)this.results.set(result.id,result)
        // Snapshots remain for asset validation, but reference bytes are no longer needed after submission.
        for(const key of ids)this.requests.get(key)!.references=[]
        if(results.some(r=>r.error))this.stopped=true
      } catch(e) {this.stopped=true;throw e}
    }
    const result=this.results.get(request.id)!
    if(!result.bytes)throw new Error(result.error||'Gambar belum dapat dipastikan.')
    this.results.delete(id)
    // Consumption must not trigger a second request if a caller repeats this clip.
    this.results.set(id,{id,error:'Hasil batch klip ini sudah diambil.'})
    return result.bytes
  }
  stop():void {this.stopped=true}
}
