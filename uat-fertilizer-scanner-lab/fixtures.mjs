// Local synthetic scan responses only. No Firebase, actual AI or OCR engine.
export const rawText=[
 'Tanggal: 12/11/2026','Shift: 2','Mandor: Mandor B','Asisten: Asisten A',
 'Jenis Unit: Stool Splitter','No. Unit: SS001','Paddock: C-003','Activity: Top Dressing',
 'Pengisian ke: 1','Jenis Pupuk: Synthetic NK','Dosis Target: 450','Jumlah Pupuk: 9400','Hasil Kerja: 21','Status Hose: Lancar','Perataan Pupuk: 2',
 'Pengisian ke: 2','Jenis Pupuk: Synthetic DAP','Dosis Target: 150','Jumlah Pupuk: 3225','Hasil Kerja: 21,5','Status Hose: Lancar','Perataan Pupuk: 2'
].join('\n')
export const master={names:['Mandor A','Mandor B'],assistants:['Asisten A'],shifts:['1','2'],unitMap:{'Stool Splitter':['SS001','SS002']},plans:[{paddock:'C-003',activity:'Top Dressing',type:'FERTILIZER',category:'fertilizer'}],materials:[{material:'Synthetic NK'},{material:'Synthetic DAP'}]}
export const defaults={date:'2026-11-12',shift:'2',mandor:'Mandor B',assistant:'Asisten A'}
const filling=(i,name,dose,kg,ha)=>({pengisianKe:i,jenisPupuk:name,dosis:dose,jumlah:kg,hasilKerja:ha,statusHose:'Lancar',pemerataanPupuk:'2'})
export const result=()=>({...defaults,units:[{unit:'Stool Splitter',noUnit:'SS001',paddock:'C-003',type:'FERTILIZER',activity:'Top Dressing',catatan:'',fillings:[filling(1,'Synthetic NK','450','9400','21'),filling(2,'Synthetic DAP','150','3225','21.5')]}],rawText,confidence:96,warnings:[],sourceModel:'synthetic-fixture'})
export const state={ai:'ok',ocr:'ok',calls:[],feedback:[],applied:[]}
export const cloneFertilizerScanResult=v=>structuredClone(v)
export async function scanFertilizerReportWithGemini(file,_master,_defaults,_user,stage){
 state.calls.push({engine:'ai',name:file.name});stage('fixture')
 if(state.ai==='fail')throw Error('503 synthetic unavailable')
 return result()
}
export const OEM={LSTM_ONLY:1}
export async function createWorker(languages,_oem,_options){
 state.calls.push({engine:'ocr',languages})
 return {async setParameters(){},async recognize(){if(state.ocr==='fail')throw Error('synthetic OCR failure');return {data:{text:rawText,confidence:88}}},async terminate(){state.calls.push({engine:'terminate'})}}
}
export async function applyFertilizerOcrMemory(v){state.calls.push({engine:'memory'});return v}
function feedback(engine,args){
 state.feedback.push({engine,original:structuredClone(args.original),corrected:structuredClone(args.corrected),name:args.sourceFileName,mode:args.applyMode})
 return {saved:true,changedFieldCount:JSON.stringify(args.original)===JSON.stringify(args.corrected)?0:1}
}
export async function saveFertilizerScanFeedback(args){return feedback('gemini',args)}
export async function saveFertilizerOcrFeedback(args){return feedback('ocr',args)}
