import assert from 'node:assert/strict'
import {buildUnifiedFullQc} from '../src/qcUatUnifiedFullQcFormBuilder.mjs'
import {prepareUnifiedFullQc} from '../src/qcUatUnifiedFullQcTransport.mjs'
const source={testOnly:true,kind:'spray',areaSemantics:'SCALAR_APPLICATION',dailyPlanId:'uat-ds',monthlyPlanLineId:'uat-ms',pid:'uat-p1',sourceType:'MONTHLY',date:'2026-11-03',sourceShift:'1',sourceForemanId:'uat-f1',sourceForemanName:'Mandor A',executionShift:'1',executionForemanId:'uat-f1',executionForemanName:'Mandor A',dailyRevision:0,planningOrder:1,companyCode:'uat-company',farm:'Farm A',activity:'Spray',description:'Post Emergence',stage:'Ratoon',masterVariety:'V1',selectedVarieties:['V1'],area100:1000,materials:[{materialId:'uat-herb',material:'Synthetic Herbicide',unit:'L',doseUnit:'L',dose10000:12345,totalMaterial1000000:12345000}]}
const defaults=()=>({unit:'Boom Sprayer',noUnit:'BS001',assistant:'Asisten UAT',startTime:'08:00',endTime:'17:00',notes:'Uji sintetis',holds:[{start:'12:00',end:'13:00',reason:'Istirahat',note:''}],areaHa:'9.00',dropper:'No',nozzle:'TeeJet',waterQuality:'Normal',weatherCondition:'Clear',windSpeed:'2',waterRate:'350',adjuvantDosage:'0.5',adjuvant:'Synthetic',actUsageAdjuvant:'1.5',measuredUsage:['11.3','','',''],fillings:[]})
const actor={uid:'uat-field',nonce:'case1',saveType:'ready',createdAt:'2026-11-03T08:00:00Z'}
const fertility={...source,kind:'fertilizer',areaSemantics:'COMPONENT_APPLICATION_ONLY',dailyPlanId:'uat-df',monthlyPlanLineId:'uat-mf',activity:'Fertilizer',description:'Top Dressing',materials:[{materialId:'uat-nk',material:'NK',unit:'kg',doseUnit:'kg',dose10000:4500000,totalMaterial1000000:4500000000},{materialId:'uat-dap',material:'DAP',unit:'kg',doseUnit:'kg',dose10000:1500000,totalMaterial1000000:1500000000}]}
const fertEditor=()=>({...defaults(),fillings:[{materialId:'uat-nk',productName:'Synthetic NK',kg:'3500.00',areaHa:'8.00',statusHose:'Lancar',distribution:'2'},{materialId:'uat-dap',productName:'Synthetic DAP',kg:'750.00',areaHa:'5.00',statusHose:'Lancar',distribution:'2'}]})
let n=0
const check=(label,fn)=>{fn();console.log('PASS: '+label);n++}
check('Spray full editor creates exactly validated operational fields, source IDs, actual and material slots',()=>{
 const q=buildUnifiedFullQc(source,defaults(),actor)
 assert.equal(q.record.formType,'spray');assert.equal(q.record.paddock,'uat-p1')
 assert.equal(q.record.actualAreaHa,9);assert.equal(q.record.plannedDailyAreaHa,10)
 assert.equal(q.record.actUsagePesticide1,'11.3')
 assert.equal(q.record.estUsagePesticide1,'11.11')
 assert.equal(q.record.actualPlanMaterials[0].totalMaterial,11.1105)
 assert.equal(q.record.holdTotalMinutes,60)
 assert.equal(q.record.effectiveWorkingMinutes,480)
 assert.equal(q.record.productivityHaPerHour,1.13)
 assert.equal(q.record.photoBase64,'')
 assert.deepEqual(prepareUnifiedFullQc({...q,source}),q)
})
check('Fertilizer editor preserves independent NK and DAP filling areas and actual masses',()=>{
 const q=buildUnifiedFullQc(fertility,fertEditor(),{...actor,nonce:'case2'})
 assert.equal(q.record.formType,'fertilizer')
 assert.equal(q.record.actualAreaHa,13)
 assert.deepEqual(q.record.pengisianList.map(f=>[f.jenisPupuk,f.jumlah,f.hasilKerja,f.dosisAktual]),[['Synthetic NK',3500,8,437.5],['Synthetic DAP',750,5,150]])
 assert.equal(q.record.actualPlanMaterials[0].totalMaterial,5850)
 assert.equal(q.record.actualPlanMaterials[1].totalMaterial,1950)
 assert.equal(q.record.workingDurationMinutes,540)
 assert.equal(q.record.holdTotalMinutes,60)
 assert.equal(q.record.effectiveWorkingMinutes,480)
 assert.equal(q.record.scanReportPhotoBase64,'')
 assert.deepEqual(prepareUnifiedFullQc({...q,source:fertility}),q)
})
check('Spray draft zero area, no timing and no unit remains draft and has no client-created Actual',()=>{
 const e={...defaults(),areaHa:'0',unit:'',noUnit:'',startTime:'',endTime:'',holds:[],measuredUsage:['','','','']}
 const q=buildUnifiedFullQc(source,e,{...actor,nonce:'case3',saveType:'draft'})
 assert.equal(q.record.actualAreaHa,0)
 assert.equal(q.record.saveType,'draft')
 assert.equal(q.record.actualReportId,undefined)
})
check('Fertilizer draft with empty filling is acceptable, with no scalar coverage claim',()=>{
 const e={...fertEditor(),fillings:[{materialId:'uat-nk',productName:'',kg:'0',areaHa:'0',statusHose:'',distribution:''}],unit:'',noUnit:'',startTime:'',endTime:'',holds:[]}
 const q=buildUnifiedFullQc(fertility,e,{...actor,nonce:'case4',saveType:'draft'})
 assert.equal(q.record.actualAreaHa,0)
 assert.equal(q.record.saveType,'draft')
 assert.equal(q.record.applicationArea100,undefined)
})
check('Ready times require positive effective minutes, reject overlaps and zero area',()=>{
 assert.throws(()=>buildUnifiedFullQc(source,{...defaults(),endTime:'08:00'},actor),{message:'INVALID_FORM_DURATION'})
 assert.throws(()=>buildUnifiedFullQc(source,{...defaults(),holds:[{start:'12:00',end:'14:00',reason:'A',note:''},{start:'13:00',end:'14:30',reason:'B',note:''}]},actor),{message:'INVALID_FORM_HOLD'})
 assert.throws(()=>buildUnifiedFullQc(source,{...defaults(),areaHa:'0'},actor),{message:'INVALID_FORM_DECIMAL'})
})
check('overnight shift computes actual hold intervals and productivity consistently',()=>{
 const e={...defaults(),startTime:'15:00',endTime:'01:00',holds:[{start:'23:30',end:'00:30',reason:'Wind',note:''}]}
 const q=buildUnifiedFullQc(source,e,{...actor,nonce:'case5'})
 assert.equal(q.record.workingDurationMinutes,600)
 assert.equal(q.record.holdTotalMinutes,60)
 assert.equal(q.record.effectiveWorkingMinutes,540)
 assert.equal(q.record.productivityHaPerHour,1)
})
check('Full fertilizer missing component or unmapped material blocks without fallback',()=>{
 assert.throws(()=>buildUnifiedFullQc(fertility,{...fertEditor(),fillings:[{...fertEditor().fillings[0],materialId:'uat-unknown'}]},actor),{message:'INVALID_FORM_COMPONENT'})
 assert.throws(()=>buildUnifiedFullQc(fertility,{...fertEditor(),fillings:[]},actor),{message:'INVALID_FORM_FILLINGS'})
})
check('Invalid hectares, disallowed precision, missing metadata and invalid actor blocked',()=>{
 for(const val of ['1e3','9,5','9.999','-1',''])assert.throws(()=>buildUnifiedFullQc(source,{...defaults(),areaHa:val},actor),{message:'INVALID_FORM_DECIMAL'})
 assert.throws(()=>buildUnifiedFullQc(source,defaults(),{...actor,uid:'real-user'}),{message:'INVALID_FORM_IDENTITY'})
 assert.throws(()=>buildUnifiedFullQc({...source,testOnly:false},defaults(),actor),{message:'INVALID_FULL_SOURCE'})
})
check('Material edits cannot rewrite authoritative source prescription, dose or paddock',()=>{
 const e=defaults();const q=buildUnifiedFullQc(source,e,actor)
 assert.equal(q.record.pesticide1,source.materials[0].material)
 assert.equal(q.record.dosage1,source.materials[0].dose10000/10000)
 assert.equal(q.record.paddock,source.pid)
 assert.equal(q.record.dailyPlanId,source.dailyPlanId)
 assert.equal(q.record.foreman,undefined)
})
check('Identical input and actor nonce preserve full request and audit revision for safe retry',()=>{
 const a=buildUnifiedFullQc(source,defaults(),actor),b=buildUnifiedFullQc(structuredClone(source),structuredClone(defaults()),structuredClone(actor))
 assert.deepEqual(a,b)
 assert.equal(a.record.clientRevision,b.record.clientRevision)
 assert.equal(a.jobId,b.jobId)
})
console.log('SUCCESS: '+n+' UAT full Spray/Fertilizer operational editor contract checks passed (offline)')
