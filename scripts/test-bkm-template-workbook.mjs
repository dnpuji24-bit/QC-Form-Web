import assert from 'node:assert/strict'
import {test} from 'node:test'
import ExcelJS from 'exceljs'
import {buildBkmWorkbook,BKM_NAVY,BKM_GREY} from '../src/bkmTemplateWorkbook.mjs'
const operations=[[1,'10619178','Irrigation','JAGF-3-N-006',232.4004,'','Ha',27.6,0,15.862,0.42528985507246375,'935','','']]
const materials=[[1,'JAGF-3-N-006','N001','NK','Kg',15,25,'935','','Catatan']]
const base={company:'GPA',division:'UnM',date:'2026-11-27',operations,materials,totals:['Total','','','','','','Ha',27.6,0,15.862]}
async function roundTrip(input){
 const book=buildBkmWorkbook(input)
 const next=new ExcelJS.Workbook()
 await next.xlsx.load(await book.xlsx.writeBuffer())
 return next.getWorksheet('Rekap BKM')
}
test('Original ODS template geometry, colors, font, numeric values and landscape survive XLSX round trip',async()=>{
 const s=await roundTrip(base)
 assert.equal(s.getCell('B1').value,'REKAP BUKU KERJA MANDOR')
 assert.equal(s.getCell('B1').font.name,'Aptos Narrow')
 assert.equal(s.getCell('B1').font.size,14)
 assert.equal(s.getCell('B7').fill.fgColor.argb,BKM_NAVY)
 assert.equal(s.getCell('G10').font.color.argb,'FFFFFFFF')
 assert.equal(s.getCell('B12').fill.fgColor.argb,BKM_GREY)
 assert.equal(s.getCell('C12').border.bottom.style,'thin')
 for(const a of ['D12','F12','D26','H26','I26','O26','Q26'])assert.ok(s.getCell(a).isMerged,a)
 assert.equal(s.getCell('C12').value,'10619178')
 assert.equal(s.getCell('E12').value,'Irrigation')
 assert.equal(s.getCell('G12').value,'JAGF-3-N-006')
 assert.equal(s.getCell('G12').alignment.shrinkToFit,true)
 assert.notEqual(s.getCell('G12').alignment.wrapText,true)
 assert.equal(s.getRow(12).height,18)
 assert.equal(s.getCell('H12').value,232.4004)
 assert.equal(s.getCell('L12').value,0)
 assert.equal(s.getCell('M12').value,15.862)
 assert.equal(s.getCell('N12').numFmt,'0.00%')
 assert.equal(s.getCell('B21').value,10)
 assert.equal(s.getCell('B22').value,'Total')
 assert.equal(s.getCell('B24').value,'Material')
 assert.equal(s.getCell('K27').value,15)
 assert.equal(s.getCell('B36').value,10)
 assert.equal(s.getCell('K38').value,'Disetujui Oleh')
 assert.equal(s.getCell('K43').value,'General Manager')
 assert.equal(s.getCell('N43').value,'Manager')
 assert.equal(s.getCell('P43').value,'Asisten')
 assert.equal(s.pageSetup.orientation,'landscape')
 assert.equal(s.pageSetup.fitToWidth,1)
 assert.equal(s.pageSetup.fitToHeight,1)
 assert.equal(s.pageSetup.horizontalCentered,true)
 assert.ok(s.pageSetup.printArea.includes('B1')&&s.pageSetup.printArea.includes('Q43'))
 assert.equal(s.getRow(26).height,52.5)
})
test('Extra operation and material rows and eight custom columns retain values and avoid merged-cell overlap',async()=>{
 const extended=Array.from({length:13},(_,i)=>[...operations[0].slice(0,1),...operations[0].slice(1,13),'Note '+i])
 const extra=Array.from({length:8},(_,i)=>'Extra '+i)
 const mats=Array.from({length:12},(_,i)=>[...materials[0],...extra.map(x=>x+' '+i)])
 const s=await roundTrip({...base,operations:extended,materials:mats,materialColumns:extra})
 assert.equal(s.getCell('Q24').value,'Note 12')
 assert.equal(s.getCell('B25').value,'Total')
 assert.equal(s.getCell('Y29').value,'Extra 7')
 assert.equal(s.getCell('Y41').value,'Extra 7 11')
 assert.equal(s.getCell('K48').value,'General Manager')
 assert.equal(s.pageSetup.fitToWidth,1)
 assert.equal(s.pageSetup.fitToHeight,0)
 assert.ok(s.pageSetup.printArea.includes('Y48'))
})

test('Long notes expand the row without wrapping the paddock identifier',async()=>{
 const row=[...operations[0]]
 row[13]='Catatan lapangan yang panjang\nBaris kedua mencatat hasil pengamatan'
 const sheet=await roundTrip({...base,operations:[row]})
 assert.equal(sheet.getCell('Q12').value,row[13])
 assert.equal(sheet.getCell('Q12').alignment.wrapText,true)
 assert.ok(sheet.getRow(12).height>33)
 assert.equal(sheet.getCell('G12').alignment.shrinkToFit,true)
})

test('Grid export preserves empty positions and exact added or removed row counts',async()=>{
 const s=await roundTrip({...base,exactRowCounts:true,
  operations:[...Array.from({length:11},()=>[]),operations[0]],
  materials:[[],materials[0],[]],
 })
 assert.equal(s.getCell('E12').value,'')
 assert.equal(s.getCell('E23').value,'Irrigation')
 assert.equal(s.getCell('B24').value,'Total')
 assert.equal(s.getCell('G29').value,'')
 assert.equal(s.getCell('G30').value,'NK')
 assert.equal(s.getCell('B31').value,3)
 assert.equal(s.getCell('B32').value,null)
 assert.equal(s.pageSetup.fitToHeight,0)
})
