import { collection, getDocs, query as fsQuery, where, type Firestore } from 'firebase/firestore'

type Paddock={pid:string;companyCode:string;farm:string;areaPlantedHa:number}
type Cell={activity:string;actual:number;manual:number;dates:Set<string>}
type ActivityDay={activity:string;days:{date:string;plan:number;actual:number}[]}
type ProductivityDay={date:string;plan:number;actual:number}
type ActivityShare={activity:string;value:number}
type SummaryExportInput={
  db:Firestore
  paddocks:Paddock[]
  masterActivityNames:string[]
  period:string
  filterLabels:string[]
  monthlyTarget:number
  monthlyActual:number
  manualActual:number
  productivity:ProductivityDay[]
  activityDays:ActivityDay[]
  activityShares:ActivityShare[]
  onProgress:(message:string)=>void
}

function txt(value:unknown){return value===null||value===undefined?'':String(value).trim()}
function numeric(value:unknown){const n=Number(value||0);return Number.isFinite(n)?n:0}
function activityKey(value:string){return txt(value).normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\u00A0/g,' ').replace(/\s+/g,' ').toLocaleLowerCase('id-ID')}
function safeText(value:string){return /^[=+@\-\t\r]/.test(value)?("'"+value):value}
function safeCell(value:string|number){return typeof value==='number'?value:safeText(value)}
type ExcelCell=string|number

function addSheet(XLSX:typeof import('xlsx'),workbook:import('xlsx').WorkBook,name:string,headers:string[],rows:ExcelCell[][],widths:number[],numericColumns:number[]){
  const sheet=XLSX.utils.aoa_to_sheet([headers,...rows.map(row=>row.map(safeCell))])
  sheet['!cols']=widths.map(wch=>({wch}))
  sheet['!autofilter']={ref:'A1:'+XLSX.utils.encode_col(headers.length-1)+(rows.length+1)}
  for(let index=0;index<rows.length;index++)for(const col of numericColumns){
    const address=XLSX.utils.encode_cell({r:index+1,c:col})
    const cell=sheet[address]
    if(cell&&cell.t==='n')cell.z='#,##0.0000'
  }
  XLSX.utils.book_append_sheet(workbook,sheet,name)
}

/**
 * Exports EVERY Master Paddock and its history. The visible Summary table is
 * paginated; never use its page-limited rows as an export source.
 * Keep Firestore requests bounded and aggregate as each small batch completes.
 */
export async function exportAllPlanSummary(input:SummaryExportInput){
  const {db,onProgress}=input
  const paddocks=[...new Map(input.paddocks.filter(row=>row.pid).map(row=>[row.pid,row])).values()]
    .sort((a,b)=>a.pid.localeCompare(b.pid,undefined,{numeric:true}))
  if(!paddocks.length)throw new Error('Master Paddock masih kosong. Refresh Summary sebelum export.')
  const byPid=new Map<string,Map<string,Cell>>()
  const fallbackAreas=new Map<string,number>()
  const allActivities=new Map<string,string>()
  for(const activity of input.masterActivityNames){const key=activityKey(activity);if(key&&!allActivities.has(key))allActivities.set(key,activity)}

  function cellFor(pid:string,activity:string){
    const key=activityKey(activity)
    if(!key)return null
    if(!allActivities.has(key))allActivities.set(key,activity)
    let perPid=byPid.get(pid)
    if(!perPid){perPid=new Map();byPid.set(pid,perPid)}
    let cell=perPid.get(key)
    if(!cell){cell={activity:allActivities.get(key)||activity,actual:0,manual:0,dates:new Set()};perPid.set(key,cell)}
    return cell
  }

  const ids=paddocks.map(row=>row.pid)
  const chunkSize=10,concurrentChunks=2
  const chunks:string[][]=[]
  for(let index=0;index<ids.length;index+=chunkSize)chunks.push(ids.slice(index,index+chunkSize))
  let loadedPids=0
  for(let offset=0;offset<chunks.length;offset+=concurrentChunks){
    const group=chunks.slice(offset,offset+concurrentChunks)
    const results=await Promise.all(group.map(async part=>{
      const [m,a]=await Promise.all([
        getDocs(fsQuery(collection(db,'monthly_plans'),where('pid','in',part))),
        getDocs(fsQuery(collection(db,'daily_reports'),where('pid','in',part))),
      ])
      return{monthly:m.docs,actual:a.docs}
    }))
    for(const result of results){
      for(const doc of result.monthly){
        const row=doc.data() as Record<string,unknown>,pid=txt(row.pid).toUpperCase()
        if(!pid)continue
        const activity=txt(row.activity||row.description)
        const cell=cellFor(pid,activity)
        if(cell)cell.manual+=numeric(row.manualActualAreaHa)
        fallbackAreas.set(pid,Math.max(fallbackAreas.get(pid)||0,numeric(row.targetAreaHa)))
      }
      for(const doc of result.actual){
        const row=doc.data() as Record<string,unknown>,pid=txt(row.pid).toUpperCase()
        if(!pid)continue
        const activity=txt(row.activity||row.description)
        const cell=cellFor(pid,activity)
        if(cell){
          cell.actual+=numeric(row.actualAreaHa)
          const date=txt(row.date)
          if(date)cell.dates.add(date)
        }
      }
    }
    loadedPids+=group.reduce((sum,part)=>sum+part.length,0)
    onProgress('Mengambil histori paddock '+loadedPids+' / '+paddocks.length+' PID…')
    // Yield between requests and XLSX work to keep the page responsive.
    await new Promise<void>(resolve=>setTimeout(resolve,0))
  }

  const activities=[...allActivities.entries()].sort((a,b)=>a[1].localeCompare(b[1],undefined,{numeric:true}))
  const activityHeaders=activities.flatMap(([,label])=>[label+' (Ha)',label+' - Tanggal',label+' - Manual (Ha)'])
  const matrixRows:ExcelCell[][]=[]
  const detailRows:ExcelCell[][]=[]
  let totalActual=0,totalManual=0,workedPaddocks=0
  for(const paddock of paddocks){
    const cells=byPid.get(paddock.pid)||new Map<string,Cell>()
    let paddockTotal=0
    const matrix:ExcelCell[]=[paddock.pid,paddock.companyCode,paddock.farm,paddock.areaPlantedHa||fallbackAreas.get(paddock.pid)||0]
    for(const [key,label] of activities){
      const cell=cells.get(key)
      const actual=cell?.actual||0,manual=cell?.manual||0,area=actual+manual
      const dates=cell?[...cell.dates].sort().join(', '):''
      matrix.push(area,dates,manual)
      if(area!==0){
        detailRows.push([paddock.pid,paddock.companyCode,paddock.farm,label,actual,manual,area,dates,paddock.areaPlantedHa||fallbackAreas.get(paddock.pid)||0])
        paddockTotal+=area
      }
      totalActual+=actual
      totalManual+=manual
    }
    if(paddockTotal>0)workedPaddocks++
    matrixRows.push(matrix)
  }

  onProgress('Menyusun workbook Excel '+paddocks.length+' PID · '+activities.length+' activity…')
  const XLSX=await import('xlsx')
  const workbook=XLSX.utils.book_new()
  const summaryRows:ExcelCell[][]=[
    ['Waktu Export',new Date().toLocaleString('id-ID')],
    ['Cakupan Paddock','Seluruh Master Paddock / semua periode (tidak mengikuti filter atau halaman tabel)'],
    ['Jumlah Master Paddock',paddocks.length],
    ['Paddock dengan Actual atau Manual',workedPaddocks],
    ['Jumlah Activity Paddock',activities.length],
    ['Actual Web seluruh histori (Ha)',totalActual],
    ['Progress Manual seluruh histori (Ha)',totalManual],
    ['Total Actual + Manual seluruh histori (Ha)',totalActual+totalManual],
    ['Dashboard: Periode',input.period],
    ['Dashboard: Filter',input.filterLabels.join(' · ')],
    ['Dashboard: Monthly Target (Ha)',input.monthlyTarget],
    ['Dashboard: Monthly Actual + Manual (Ha)',input.monthlyActual],
    ['Dashboard: Monthly Manual (Ha)',input.manualActual],
    ['Catatan','Luas Actual per Paddock menggunakan seluruh histori daily_reports serta progress manual Monthly; tidak dibatasi page 25/50/100.'],
    ['Catatan Tanggal','Progress manual tidak diberi tanggal kerja karena sumber tidak memiliki tanggal aktual.'],
  ]
  addSheet(XLSX,workbook,'Ringkasan',['Parameter','Nilai'],summaryRows,[42,110],[1])
  addSheet(XLSX,workbook,'Summary Paddock',['PID','Company','Farm','Luas Paddock (Ha)',...activityHeaders],matrixRows,[25,15,13,23,...activities.flatMap(()=>[23,40,24])],[3,...activities.map((_,i)=>[4+i*3,6+i*3]).flat()])
  addSheet(XLSX,workbook,'Detail Paddock',['PID','Company','Farm','Activity','Actual Web (Ha)','Manual (Ha)','Total (Ha)','Tanggal Actual','Luas Paddock (Ha)'],detailRows,[25,15,13,30,22,18,19,48,24],[4,5,6,8])
  addSheet(XLSX,workbook,'Produktivitas Harian',['Tanggal','Daily Plan (Ha)','Actual Plan (Ha)','Selisih Actual - Plan (Ha)'],input.productivity.map(row=>[row.date,row.plan,row.actual,row.actual-row.plan]),[18,22,23,28],[1,2,3])
  addSheet(XLSX,workbook,'Activity per Tanggal',['Activity','Tanggal','Daily Plan (Ha)','Actual Plan (Ha)','Selisih (Ha)'],input.activityDays.flatMap(row=>row.days.map(day=>[row.activity,day.date,day.plan,day.actual,day.actual-day.plan])),[33,18,23,23,20],[2,3,4])
  const shareTotal=input.activityShares.reduce((sum,row)=>sum+row.value,0)
  addSheet(XLSX,workbook,'Komposisi Activity',['Activity','Luas (Ha)','Persentase (%)'],input.activityShares.map(row=>[row.activity,row.value,shareTotal>0?row.value/shareTotal*100:0]),[38,24,23],[1,2])

  // XLSX.writeFile exports only after every query succeeded; no partial workbook.
  onProgress('Mengunduh file Summary Excel…')
  const stamp=new Date().toISOString().slice(0,10)
  XLSX.writeFile(workbook,'Summary_Plan_Seluruh_PID_'+stamp+'.xlsx')
  return{paddocks:paddocks.length,activities:activities.length,detailRows:detailRows.length}
}
