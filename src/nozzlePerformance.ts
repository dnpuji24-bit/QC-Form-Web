/**
 * TeeJet TTI60 reference table, user-supplied workbook:
 * TeeJet_Halaman_21_TTI60(1).xlsx — 'TTI60 Halaman 21', A7:F55.
 * Based on TeeJet Spray Tips Pocket Guide p.21, water at ~21 °C.
 * Each flow value is for ONE tip at the specified pressure.
 * Droplet classes are classifications, NOT numeric VMD/µm readings.
 */
export type DropletClass='C'|'VC'|'XC'|'UC'
export type NozzlePoint={bar:number;litersPerMinute:number;droplet:DropletClass;lerap:string}
export type NozzleSpec={code:string;color:string;points:NozzlePoint[]}
type Series={code:string;color:string;flow:number[];drop:DropletClass[];lerap:string[]}
const PRESSURES=[1.5,2,3,4,5,6,7] as const
const SOURCE:Series[]=[
  {code:'TTI60-11002VP',color:'Kuning',flow:[0.56,0.65,0.79,0.91,1.02,1.12,1.21],drop:['UC','UC','XC','VC','VC','VC','C'],lerap:['***','***','***','***','**','—','—']},
  {code:'TTI60-110025VP',color:'Ungu',flow:[0.70,0.81,0.99,1.14,1.28,1.40,1.51],drop:['UC','UC','XC','VC','VC','VC','C'],lerap:['***','***','***','***','***','—','—']},
  {code:'TTI60-11003VP',color:'Biru',flow:[0.83,0.96,1.18,1.36,1.52,1.67,1.80],drop:['UC','UC','UC','XC','XC','VC','VC'],lerap:['***','***','***','***','***','—','—']},
  {code:'TTI60-11004VP',color:'Merah',flow:[1.12,1.29,1.58,1.82,2.04,2.23,2.41],drop:['UC','UC','UC','XC','XC','VC','VC'],lerap:['***','***','***','***','***','—','—']},
  {code:'TTI60-11005VP',color:'Coklat',flow:[1.39,1.61,1.97,2.27,2.54,2.79,3.01],drop:['UC','UC','UC','XC','XC','VC','VC'],lerap:['***','***','***','***','***','—','—']},
  {code:'TTI60-11006VP',color:'Silver',flow:[1.68,1.94,2.37,2.74,3.06,3.35,3.62],drop:['UC','UC','UC','XC','XC','XC','VC'],lerap:['—','—','—','—','—','—','—']},
  {code:'TTI60-11008VP',color:'Putih',flow:[2.23,2.58,3.16,3.65,4.08,4.47,4.83],drop:['UC','UC','UC','UC','UC','XC','XC'],lerap:['—','—','—','—','—','—','—']},
]

export const DROPLET_LABELS:Record<DropletClass,string>={
  C:'Coarse (Kasar)',VC:'Very Coarse (Sangat Kasar)',
  XC:'Extremely Coarse (Ekstrem Kasar)',UC:'Ultra Coarse (Ultra Kasar)',
}
export const TTI60_NOZZLES:NozzleSpec[]=SOURCE.map(series=>({
  code:series.code,color:series.color,
  points:PRESSURES.map((bar,index)=>({bar,litersPerMinute:series.flow[index],droplet:series.drop[index],lerap:series.lerap[index]})),
}))

/** Match e.g. 'TTI60-11004 (Merah)' to official TTI60-11004VP.
 *  Do not match other nozzle families or guesses, since their spectra differ.
 */
export function matchTTI60Nozzle(name:string):NozzleSpec|undefined{
  const normalized=name.toUpperCase().replace(/\s+/g,'').replace(/[^A-Z0-9]/g,'')
  return TTI60_NOZZLES.find(item=>normalized.startsWith(item.code.replace(/VP$/,''))
    &&(normalized===item.code||normalized===item.code.replace(/VP$/,'')||normalized.startsWith(item.code.replace(/VP$/,'')+'MERAH')||normalized.startsWith(item.code.replace(/VP$/,'')+'COKLAT')||normalized.startsWith(item.code.replace(/VP$/,'')+'KUNING')||normalized.startsWith(item.code.replace(/VP$/,'')+'BIRU')||normalized.startsWith(item.code.replace(/VP$/,'')+'UNGU')||normalized.startsWith(item.code.replace(/VP$/,'')+'SILVER')||normalized.startsWith(item.code.replace(/VP$/,'')+'PUTIH')))
}
/** Water rate = 600 × flow (L/min per tip) / (speed km/h × spacing m). */
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
/** Manual pressure is continuously editable; for a non-tabulated pressure
 *  compute flow via Q ∝ sqrt(P) from the nearest point, but do NOT
 *  extrapolate or fabricate droplet classes.
 */
export function manualPressureCalculation(spec:NozzleSpec,bar:number,waterRate:number,spacing:number,minSpeed:number,maxSpeed:number):Calculation|null{
  const points=spec.points
  if(!Number.isFinite(bar)||bar<points[0].bar||bar>points[points.length-1].bar)return null
  const exact=points.find(p=>Math.abs(p.bar-bar)<1e-6)
  const anchor=exact||points.reduce((nearest,item)=>Math.abs(item.bar-bar)<Math.abs(nearest.bar-bar)?item:nearest,points[0])
  const flow=exact?exact.litersPerMinute:anchor.litersPerMinute*Math.sqrt(bar/anchor.bar)
  const speedKmh=tractorSpeedKmh(flow,waterRate,spacing)
  return {bar,flow,droplet:exact?exact.droplet:null,lerap:exact?exact.lerap:'—',speedKmh,
    inSpeedRange:speedKmh>=minSpeed&&speedKmh<=maxSpeed,source:exact?'tabel':'estimasi debit'}
}
