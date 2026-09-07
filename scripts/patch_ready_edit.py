from pathlib import Path
import re

fert = Path('src/FertilizerForm.tsx')
text = fert.read_text()
old = re.search(r"  function validateReady\(activeCards:UnitCard\[\]\)\{.*?return''\}\n", text)
if not old:
    raise SystemExit('validateReady block not found')
new = '''  function validateReady(activeCards:UnitCard[]){
    if(!date||!mandor)return{message:'Tanggal dan Mandor wajib diisi.',cardId:activeCards[0]?.id||''}
    if(!activeCards.length)return{message:'Isi minimal satu Unit Card sebelum disimpan.',cardId:''}
    const seen=new Set<string>()
    for(let i=0;i<activeCards.length;i++){
      const c=activeCards[i]
      if(!c.paddock||!c.unit||!c.noUnit||!c.activity)return{message:`Unit ${i+1}: lengkapi Paddock, Unit, No. Unit, dan Activity.`,cardId:c.id}
      const key=`${c.unit}|${c.noUnit}`.toLowerCase()
      if(seen.has(key))return{message:`Unit ${i+1}: ${c.noUnit} sudah digunakan pada unit lain.`,cardId:c.id}
      seen.add(key)
      if(!c.fillings.length)return{message:`Unit ${i+1}: minimal satu pengisian.`,cardId:c.id}
      for(const f of c.fillings){
        if(!f.jenisPupuk||num(f.dosis)<=0)return{message:`Unit ${c.noUnit||i+1} Pengisian ${f.pengisianKe}: Jenis Pupuk dan Dosis Target wajib diisi.`,cardId:c.id}
        if(num(f.jumlah)<=0||num(f.hasilKerja)<=0)return{message:`Unit ${c.noUnit||i+1} Pengisian ${f.pengisianKe}: Jumlah pupuk dan Hasil Kerja wajib lebih dari 0 sebelum status Ready.`,cardId:c.id}
      }
    }
    return null
  }
  function showReadyProblem(problem:{message:string;cardId:string}){
    if(problem.cardId)setActiveCardId(problem.cardId)
    setMessage(problem.message)
    window.setTimeout(()=>document.querySelector('.active-unit-card')?.scrollIntoView({behavior:'smooth',block:'start'}),60)
  }
'''
text = text[:old.start()] + new + text[old.end():]
target = "if(saveType==='ready'){const problem=validateReady(activeCards);if(problem)return setMessage(problem)}"
replacement = "if(saveType==='ready'){const problem=validateReady(activeCards);if(problem){showReadyProblem(problem);return}}"
if target not in text:
    raise SystemExit('ready validation call not found')
text = text.replace(target, replacement, 1)
target = "createdAt:card.createdAt||new Date().toISOString()}"
replacement = "createdAt:card.createdAt||new Date().toISOString(),clientRevision:crypto.randomUUID()}"
if target not in text:
    raise SystemExit('fert record revision target not found')
text = text.replace(target, replacement, 1)
fert.write_text(text)

spray = Path('src/SprayForm.tsx')
text = spray.read_text()
target = "createdAt:text(initialRecord?.createdAt||new Date().toISOString()),photoBase64:"
replacement = "createdAt:text(initialRecord?.createdAt||new Date().toISOString()),clientRevision:crypto.randomUUID(),photoBase64:"
if target not in text:
    raise SystemExit('spray record revision target not found')
text = text.replace(target, replacement, 1)
spray.write_text(text)

app = Path('src/App.tsx')
text = app.read_text()
merge_line = "function mergeRecordLists(existing:QcRecord[],incoming:QcRecord[]){const map=new Map<string,QcRecord>();for(const record of existing)if(record?.id)map.set(record.id,record);for(const record of incoming)if(record?.id)map.set(record.id,{...map.get(record.id),...record});return[...map.values()].sort((a,b)=>String(b.updatedAt||b.createdAt||b.date||'').localeCompare(String(a.updatedAt||a.createdAt||a.date||'')))}"
helper = merge_line + "\nfunction mergeRealtimeRecords(existing:QcRecord[],incoming:QcRecord[]){const incomingById=new Map(incoming.filter(r=>r?.id).map(r=>[r.id,r]));const keep=existing.filter(record=>{if(String(record.saveType||'').includes('queued'))return true;const revision=String(record.clientRevision||'');if(!revision)return false;const fresh=incomingById.get(record.id);return !fresh||String(fresh.clientRevision||'')!==revision});return mergeRecordLists(keep,incoming)}"
if merge_line not in text:
    raise SystemExit('mergeRecordLists target not found')
text = text.replace(merge_line, helper, 1)
target = "setRecords(oldRecords=>mergeRecordLists(oldRecords.filter(record=>String(record.saveType||'').includes('queued')),next))"
replacement = "setRecords(oldRecords=>mergeRealtimeRecords(oldRecords,next))"
if target not in text:
    raise SystemExit('realtime merge target not found')
text = text.replace(target, replacement, 1)
old_finalize = "function canFinalize(user:User,record:QcRecord){if(record.saveType==='uploaded'||record.saveType==='upload_queued')return false;"
new_finalize = "function canFinalize(user:User,record:QcRecord){if(record.saveType!=='ready')return false;"
if old_finalize not in text:
    raise SystemExit('canFinalize target not found')
text = text.replace(old_finalize, new_finalize, 1)
app.write_text(text)

check = Path('tests/ready_edit_react_check.py')
check.write_text('''from pathlib import Path\n\nfert=Path("src/FertilizerForm.tsx").read_text()\nspray=Path("src/SprayForm.tsx").read_text()\napp=Path("src/App.tsx").read_text()\nassert "showReadyProblem(problem)" in fert\nassert "Jumlah pupuk dan Hasil Kerja wajib lebih dari 0 sebelum status Ready" in fert\nassert "clientRevision:crypto.randomUUID()" in fert\nassert "clientRevision:crypto.randomUUID()" in spray\nassert "mergeRealtimeRecords" in app\nassert "record.saveType!=='ready'" in app\nprint("Ready edit + optimistic realtime check: OK")\n''')
