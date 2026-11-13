// Pure form helpers: unchanged numeric values are not sent to the server.
const number=v=>{
 if(typeof v!=='string'||!v.trim()||!Number.isFinite(Number(v))||Number(v)<0)throw Error('Isi angka yang valid, tidak negatif.')
 return Number(v)
}
const same=(a,b)=>a===b||(a.trim()!==''&&b.trim()!==''&&Number.isFinite(Number(a))&&Number(a)===Number(b))
export function historicalFormChanges(formType,before,after){
 if(!['spray','fertilizer'].includes(formType))throw Error('Jenis QC tidak didukung.')
 const changes={}
 if(before.note!==after.note){
  if(after.note.length>2000||after.note.includes('[UNIT BERHENTI]'))throw Error('Catatan tidak valid.')
  changes.note=after.note.trim()
 }
 if(formType==='spray'){
  if(!same(before.area,after.area)){
   const area=number(after.area)
   if(area<=0)throw Error('Luas harus lebih dari nol.')
   changes.area=area
  }
 }else{
  if(before.fillings.length!==after.fillings.length)throw Error('Jumlah pengisian tidak boleh berubah.')
  if(after.fillings.some((f,i)=>!same(f.jumlah,before.fillings[i].jumlah)||!same(f.hasilKerja,before.fillings[i].hasilKerja))){
   if(!after.fillings.length||after.fillings.length>100)throw Error('Pengisian perlu pemeriksaan khusus.')
   changes.fillings=after.fillings.map(f=>({jumlah:number(f.jumlah),hasilKerja:number(f.hasilKerja)}))
   const total=changes.fillings.reduce((sum,f)=>sum+f.hasilKerja,0)
   if(!Number.isFinite(total)||total<=0)throw Error('Total luas harus lebih dari nol.')
  }
 }
 if(!Object.keys(changes).length)throw Error('Belum ada perubahan.')
 return changes
}
