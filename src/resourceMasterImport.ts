/** Parses the original Upkeep & Manuring ODS structure without inventing HR IDs
 * or equating implement capacity/QTY with a count of physical units.
 * No source rows are committed into the app bundle.
 */
export type ImportKind='employee'|'unit'
export type EmployeeImportRow={
  rowNumber:number;employeeId:string;fullName:string;joinDate:string;jobTitle:string;
  unitCode:string;reserveStatus:string;implement:string;remarks:string;front:string;
  frontRaw:string;shift:string;shiftRaw:string;workGroup:string;equipmentType:string;
  supervisorName:string;warnings:string[];invalid:boolean
}
export type UnitImportRow={
  rowNumber:number;code:string;implement:string;equipmentType:string;brand:string;
  model:string;year:string;serialNo:string;planCompany:string;planUser:string;
  capacitySpec:string;category:string;operatorRequirement:number|null;
  warnings:string[];invalid:boolean
}
export type ParsedImport={kind:ImportKind;sheetName:string;headerRow:number;employees:EmployeeImportRow[];units:UnitImportRow[]}
const val=(x:unknown)=>String(x??'').trim()
const normalized=(x:unknown)=>val(x).normalize('NFKC').toUpperCase().replace(/\s+/g,' ')
const key=(x:unknown)=>normalized(x).replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'')
export const identityKey=key
function dateIso(raw:string){
  if(!raw)return''
  const parts=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw)
  if(!parts)return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:''
  const day=Number(parts[1]),month=Number(parts[2]),year=Number(parts[3])
  const check=new Date(Date.UTC(year,month-1,day))
  if(check.getUTCFullYear()!==year||check.getUTCMonth()+1!==month||check.getUTCDate()!==day)return''
  return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0')
}
const problematic=(v:string)=>/^(#N\/A|N\/A|#REF!|#VALUE!)$/i.test(v)
function headerIndex(rows:unknown[][],kind:ImportKind){
  for(let index=0;index<Math.min(rows.length,25);index++){
    const first=normalized(rows[index]?.[0]),second=normalized(rows[index]?.[1]),third=normalized(rows[index]?.[2])
    if(kind==='employee'&&first==='EMPLOYEE ID'&&second==='NAMA KARYAWAN')return index
    if(kind==='unit'&&first==='UNIT CODE'&&second==='IMPLEMENT'&&third==='EQUIPMENT TYPE')return index
  }
  return-1
}
export function locateImportSheet(sheets:Array<{name:string;rows:unknown[][]}>,kind:ImportKind){
  const found=sheets.map(s=>({...s,header:headerIndex(s.rows,kind)})).find(s=>s.header>=0)
  if(!found)throw Error(kind==='employee'?
    'Header Employee ID / Nama Karyawan tidak ditemukan. Pilih Sheet1 dari file rekap karyawan dan unit.ods.':
    'Header UNIT CODE / IMPLEMENT / EQUIPMENT TYPE tidak ditemukan. Pilih Sheet2 dari file rekap karyawan dan unit.ods.')
  return found
}
export function parseResourceRows(sheets:Array<{name:string;rows:unknown[][]}>,kind:ImportKind):ParsedImport{
  const selected=locateImportSheet(sheets,kind),index=selected.header
  const employees:EmployeeImportRow[]=[],units:UnitImportRow[]=[]
  const seenId=new Set<string>(),seenName=new Set<string>(),seenUnit=new Set<string>()
  selected.rows.slice(index+1).forEach((cells,i)=>{
    const rowNumber=index+i+2, cell=(n:number)=>val(cells[n])
    if(kind==='employee'){
      const fullName=cell(1),employeeId=cell(0),frontRaw=cell(8),shiftRaw=cell(9),joinDateRaw=cell(2)
      if(!fullName&&!employeeId)return
      const warnings:string[]=[]
      const nameId=key(fullName),eId=key(employeeId)
      let invalid=!fullName
      if(!fullName)warnings.push('Nama Karyawan kosong')
      if(!employeeId)warnings.push('Employee ID belum tersedia — disimpan kosong, perlu verifikasi')
      if(employeeId&&!/^\d{3,20}$/.test(employeeId))warnings.push('Format Employee ID tidak standar — perlu verifikasi')
      if(nameId&&seenName.has(nameId)){invalid=true;warnings.push('Nama Karyawan duplikat dalam file')}
      if(eId&&seenId.has(eId)){invalid=true;warnings.push('Employee ID duplikat dalam file')}
      seenName.add(nameId);if(eId)seenId.add(eId)
      if(problematic(frontRaw))warnings.push('Front sumber '+frontRaw+' — perlu verifikasi')
      if(problematic(shiftRaw))warnings.push('Shift sumber '+shiftRaw+' — perlu verifikasi')
      const joinDate=dateIso(joinDateRaw)
      if(joinDateRaw&&!joinDate)warnings.push('Join Date tidak dikenali — perlu verifikasi')
      employees.push({rowNumber,employeeId,fullName,joinDate,jobTitle:cell(3),
        unitCode:cell(4),reserveStatus:cell(5),implement:cell(6),
        remarks:cell(7),front:problematic(frontRaw)?'':frontRaw,frontRaw,
        shift:problematic(shiftRaw)?'':shiftRaw,shiftRaw,
        workGroup:cell(10),equipmentType:cell(11),supervisorName:cell(13),warnings,invalid})
    }else{
      const code=cell(0),implement=cell(1),equipmentType=cell(2)
      if(!code&&!implement&&!equipmentType)return
      const warnings:string[]=[]
      let invalid=!code||(!implement&&!equipmentType)
      if(!code)warnings.push('UNIT CODE kosong')
      if(!implement&&!equipmentType)warnings.push('IMPLEMENT dan EQUIPMENT TYPE kosong')
      const codeKey=key(code)
      if(codeKey&&seenUnit.has(codeKey)){invalid=true;warnings.push('Kode unit duplikat dalam file')}
      seenUnit.add(codeKey)
      const operatorRaw=cell(11)
      const operatorRequirement=/^\d+$/.test(operatorRaw)?Number(operatorRaw):null
      if(operatorRaw&&operatorRequirement===null)warnings.push('JUMLAH OP bukan angka')
      units.push({rowNumber,code,implement,equipmentType,brand:cell(3),model:cell(4),
        year:cell(5),serialNo:cell(6),planCompany:cell(7),planUser:cell(8),
        capacitySpec:cell(9),category:cell(10),operatorRequirement,warnings,invalid})
    }
  })
  return{kind,sheetName:selected.name,headerRow:index+1,employees,units}
}
function hash(text:string){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')}
export function employeeDocId(row:EmployeeImportRow){
  return row.employeeId?'emp-'+key(row.employeeId).toLowerCase():
    'unverified-'+hash(normalized(row.fullName))
}
export function unitDocId(kindName:string,code:string){
  return (kindName+'-'+code).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,180)
}
export function unitKindName(row:UnitImportRow){return row.implement||row.equipmentType}
