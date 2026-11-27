// Layout taken from "template Rekapan BKM.ods" (B:Q, 43 rows).
// Keep report values separate from presentation; never populate template example values.
import ExcelJS from 'exceljs'
export const BKM_NAVY='FF002060'
export const BKM_GREY='FFD9D9D9'
const WHITE='FFFFFFFF',BLACK='FF000000'
export const BKM_COLUMN_CM=[1.693333,1.710972,0.423333,2.345972,2.663472,3.192639,2.081389,2.257778,1.569861,1.075972,2.240139,2.099028,1.781528,1.340556,2.751667,2.345972,2.451806]
const opCols=[2,3,5,7,8,9,10,11,12,13,14,15,16,17]
const matCols=[2,3,5,7,10,11,12,13,14,16]
const border=color=>({top:{style:'thin',color:{argb:color}},left:{style:'thin',color:{argb:color}},bottom:{style:'thin',color:{argb:color}},right:{style:'thin',color:{argb:color}}})
const fill=argb=>({type:'pattern',pattern:'solid',fgColor:{argb}})
const numberFmt='#,##0.00##'
export function buildBkmWorkbook({number='',company='',division='',date='',operations=[],materials=[],materialColumns=[],totals=[]}){
 const wb=new ExcelJS.Workbook()
 const ws=wb.addWorksheet('Rekap BKM',{views:[{showGridLines:false}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:operations.length<=10&&materials.length<=10&&materialColumns.length===0?1:0,horizontalCentered:true,margins:{left:0.708661,right:0.708661,top:0.314961,bottom:0.314961,header:0,footer:0}}})
 const opCount=Math.max(10,operations.length),matCount=Math.max(10,materials.length)
 const totalRow=12+opCount,matTitle=totalRow+2,matHeader=matTitle+2,matStart=matHeader+1
 const sign=matStart+matCount+1,lastRow=sign+5,lastCol=17+materialColumns.length
 const width=cm=>(cm*96/2.54-5)/7
 BKM_COLUMN_CM.forEach((cm,i)=>{ws.getColumn(i+1).width=Math.max(1,width(cm))})
 materialColumns.forEach((_,i)=>{ws.getColumn(18+i).width=18})
 ws.pageSetup.printArea='B1:'+ws.getCell(lastRow,lastCol).address
 function cell(r,c,value='',style={}){
  const x=ws.getCell(r,c);x.value=value==null?'':value
  x.font={name:'Aptos Narrow',size:11,color:{argb:BLACK},...style.font}
  x.alignment={vertical:'middle',horizontal:style.horizontal||'left',wrapText:true}
  if(style.background)x.fill=fill(style.background)
  if(style.border)x.border=border(style.border)
  if(style.numFmt)x.numFmt=style.numFmt
  return x
 }
 const merge=(r,c,er,ec,value,style={})=>{
  if(r!==er||c!==ec)ws.mergeCells(r,c,er,ec)
  return cell(r,c,value,style)
 }
 const head={background:BKM_NAVY,border:WHITE,font:{bold:true,color:{argb:WHITE}},horizontal:'center'}
 const body={border:BLACK,horizontal:'center'}
 const signStyle={...body}
 const title={font:{bold:true,size:14},horizontal:'center'}
 const plain={font:{bold:true}}
 for(let r=1;r<=lastRow;r++)ws.getRow(r).height=14.5
 ws.getRow(1).height=18.5
 merge(1,2,1,17,'REKAP BUKU KERJA MANDOR',title)
 for(const [i,[label,value]] of [['No',number],['PT',company],['Divisi',division],['Tanggal',date]].entries()){
  const r=i+2;ws.getRow(r).height=23;cell(r,2,label,plain);cell(r,3,':',{...plain,horizontal:'right'});merge(r,4,r,8,value)
 }
 merge(7,2,7,17,'Operation',head)
 ws.getRow(8).height=2.5
 merge(9,2,11,2,'No',head)
 merge(9,3,9,6,'Pekerjaan',head);merge(9,7,9,8,'Field',head);merge(9,9,9,14,'Target Kerja',head)
 merge(9,15,11,15,'No WO',head);merge(9,16,11,16,'No BKM',head);merge(9,17,11,17,'Keterangan',head)
 for(const [c,end,label] of [[3,4,'Opr Code'],[5,6,'Desc'],[7,7,'Paddock / Block'],[8,8,'Luas Area'],[9,9,'Jml HK'],[10,10,'UoM'],[11,11,'Luas WO']])merge(10,c,11,end,label,head)
 merge(10,12,10,14,'Actual',head)
 for(const [i,v] of ['HI','SHI','%'].entries())cell(11,12+i,v,head)
 for(let i=0;i<opCount;i++){
  const r=12+i,row=operations[i]||[i+1]
  ws.getRow(r).height=18
  for(let j=0;j<opCols.length;j++){
   const c=opCols[j],end=j===1||j===2?c+1:c
   const v=j===0?i+1:row[j]??''
   const style={...body,horizontal:[2,3,13].includes(j)?'left':([4,5,7,8,9,10].includes(j)?'right':'center'),...(j===0?{background:BKM_GREY}:{}),...([4,5,7,8,9].includes(j)?{numFmt:numberFmt}:j===10?{numFmt:'0.00%'}:{})}
   merge(r,c,r,end,v,style)
  }
  const lines=Math.max(...row.map((v,j)=>typeof v==='string'?Math.ceil(v.length/([2,3,13].includes(j)?28:18)):1))
  ws.getRow(r).height=Math.max(18,Math.min(180,lines*14))
 }
 ws.getRow(totalRow).height=18
 merge(totalRow,2,totalRow,8,'Total',{...body,font:{bold:true}})
 for(let c=9;c<=17;c++)cell(totalRow,c,'',body)
 for(const [j,c] of [[5,9],[6,10],[7,11],[8,12],[9,13]])cell(totalRow,c,totals[j]??'',{...body,font:{bold:true},numFmt:numberFmt})
 merge(matTitle,2,matTitle,lastCol,'Material',head)
 ws.getRow(matTitle+1).height=3
 ws.getRow(matHeader).height=52.5
 const headers=['No','Block/Paddock','No Material','Nama Material','UoM','Qty HI','Qty SHI','No WO','No BKM','Keterangan',...materialColumns]
 const cols=[...matCols,...materialColumns.map((_,i)=>18+i)]
 const ends=[2,4,6,9,10,11,12,13,15,17,...materialColumns.map((_,i)=>18+i)]
 headers.forEach((v,j)=>merge(matHeader,cols[j],matHeader,ends[j],v,head))
 for(let i=0;i<matCount;i++){
  const r=matStart+i,row=materials[i]||[i+1]
  ws.getRow(r).height=17
  headers.forEach((_,j)=>merge(r,cols[j],r,ends[j],j===0?i+1:row[j]??'',{...body,horizontal:[1,2,3,9].includes(j)||j>=10?'left':[5,6].includes(j)?'right':'center',...([5,6].includes(j)?{numFmt:numberFmt}:{})}))
  const lines=Math.max(...row.map((v,j)=>typeof v==='string'?Math.ceil(v.length/([3,9].includes(j)?35:20)):1))
  ws.getRow(r).height=Math.max(17,Math.min(180,lines*14))
 }
 ws.getRow(sign).height=18
 for(const [a,b,heading,role] of [[11,13,'Disetujui Oleh','General Manager'],[14,15,'Diverifikasi oleh,','Manager'],[16,17,'Dibuat oleh,','Asisten']]){
  merge(sign,a,sign,b,heading,signStyle)
  merge(sign+1,a,sign+4,b,'',signStyle)
  merge(sign+5,a,sign+5,b,role,signStyle)
 }
 return wb
}
