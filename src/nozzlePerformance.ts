/** Nozzle performance is loaded ONLY from approved uploaded sheets in Firestore. */
export type DropletClass='VF'|'F'|'M'|'C'|'VC'|'XC'|'UC'
export type NozzlePoint={bar:number;litersPerMinute:number;droplet:DropletClass;lerap:string}
export type NozzleSpec={code:string;color:string;points:NozzlePoint[];sourceFileName?:string;sourceSheet?:string}
export const NOZZLE_SPEC_COLLECTION='master_nozzle_specs'
export const DROPLET_LABELS:Record<DropletClass,string>={
 VF:'Very Fine (Sangat Halus)',F:'Fine (Halus)',M:'Medium (Sedang)',
 C:'Coarse (Kasar)',VC:'Very Coarse (Sangat Kasar)',
 XC:'Extremely Coarse (Ekstrem Kasar)',UC:'Ultra Coarse (Ultra Kasar)',
}
export function nozzleSpecId(code:string){return code.toUpperCase().replace(/[^A-Z0-9]/g,'').toLowerCase()}
/** Canonicalizes the nozzle model without changing its stored/original name.
 *  TeeJet TTI60 legacy variants like 11025 and 110025 (size 025),
 *  and VP suffix / color labels, refer to the same physical model.
 */
export function canonicalNozzleCode(value:string){
 const clean=value.toUpperCase().replace(/\([^)]*\)/g,'').replace(/[^A-Z0-9]/g,'').replace(/VP$/,'')
 const tti=clean.match(/^(TTI60)(110)(\d+)$/)
 if(tti)return tti[1]+tti[2]+String(Number(tti[3]))
 return clean
}
export function matchingNozzleCode(name:string,code:string){
 const left=canonicalNozzleCode(name),right=canonicalNozzleCode(code)
 return Boolean(left&&right&&left===right)
}
export function findNozzleSpec(name:string,specs:NozzleSpec[]){
 return specs.find(spec=>matchingNozzleCode(name,spec.code))
}
export function nozzleSpecFromData(data:Record<string,unknown>):NozzleSpec|null{
 const code=String(data.code||'').trim(),color=String(data.color||'').trim()
 if(!code||!Array.isArray(data.points))return null
 const seen=new Set<number>(),points:NozzlePoint[]=[]
 for(const raw of data.points){
  const row=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>
  const bar=Number(row.bar),litersPerMinute=Number(row.litersPerMinute),droplet=String(row.droplet||'').toUpperCase(),lerap=String(row.lerap||'—')
  if(!Number.isFinite(bar)||bar<=0||!Number.isFinite(litersPerMinute)||litersPerMinute<=0||!(droplet in DROPLET_LABELS)||seen.has(bar))continue
  seen.add(bar);points.push({bar,litersPerMinute,droplet:droplet as DropletClass,lerap})
 }
 if(!points.length)return null
 return {code,color,points:points.sort((a,b)=>a.bar-b.bar),sourceFileName:String(data.sourceFileName||''),sourceSheet:String(data.sourceSheet||'')}
}
export function tractorSpeedKmh(flowLpm:number,rateLha:number,spacingMeters:number){
 if(!(flowLpm>0&&rateLha>0&&spacingMeters>0))return NaN
 return 600*flowLpm/(rateLha*spacingMeters)
}
export function actualWaterRateLha(flowLpm:number,speedKmh:number,spacingMeters:number){
 if(!(flowLpm>0&&speedKmh>0&&spacingMeters>0))return NaN
 return 600*flowLpm/(speedKmh*spacingMeters)
}
export type Calculation={bar:number;flow:number;droplet:DropletClass|null;lerap:string;speedKmh:number;inSpeedRange:boolean;source:'tabel'|'estimasi debit'}
export function calculationsForNozzle(spec:NozzleSpec,waterRate:number,spacing:number,minSpeed:number,maxSpeed:number):Calculation[]{
 return spec.points.map(p=>{const speedKmh=tractorSpeedKmh(p.litersPerMinute,waterRate,spacing);return{
  bar:p.bar,flow:p.litersPerMinute,droplet:p.droplet,lerap:p.lerap,speedKmh,
  inSpeedRange:speedKmh>=minSpeed&&speedKmh<=maxSpeed,source:'tabel' as const,
 }})
}
/** For pressures absent from the uploaded table, flow can be estimated but droplet cannot. */
export function manualPressureCalculation(spec:NozzleSpec,bar:number,waterRate:number,spacing:number,minSpeed:number,maxSpeed:number):Calculation|null{
 const points=spec.points
 if(!points.length||!Number.isFinite(bar)||bar<points[0].bar||bar>points[points.length-1].bar)return null
 const exact=points.find(p=>Math.abs(p.bar-bar)<1e-6)
 const anchor=exact||points.reduce((nearest,item)=>Math.abs(item.bar-bar)<Math.abs(nearest.bar-bar)?item:nearest,points[0])
 const flow=exact?exact.litersPerMinute:anchor.litersPerMinute*Math.sqrt(bar/anchor.bar)
 const speedKmh=tractorSpeedKmh(flow,waterRate,spacing)
 return {bar,flow,droplet:exact?exact.droplet:null,lerap:exact?exact.lerap:'—',speedKmh,
  inSpeedRange:speedKmh>=minSpeed&&speedKmh<=maxSpeed,source:exact?'tabel':'estimasi debit'}
}
