from pathlib import Path

app = Path('src/App.tsx')
text = app.read_text()
old = "function mergeRealtimeRecords(existing:QcRecord[],incoming:QcRecord[]){const incomingById=new Map(incoming.filter(r=>r?.id).map(r=>[r.id,r]));const keep=existing.filter(record=>{if(String(record.saveType||'').includes('queued'))return true;const revision=String(record.clientRevision||'');if(!revision)return false;const fresh=incomingById.get(record.id);return !fresh||String(fresh.clientRevision||'')!==revision});return mergeRecordLists(keep,incoming)}"
new = "function mergeRealtimeRecords(existing:QcRecord[],incoming:QcRecord[]){const map=new Map<string,QcRecord>();for(const record of incoming)if(record?.id)map.set(record.id,record);for(const record of existing){if(!record?.id)continue;const fresh=map.get(record.id),revision=String(record.clientRevision||'');if(String(record.saveType||'').includes('queued')||(revision&&(!fresh||String(fresh.clientRevision||'')!==revision)))map.set(record.id,record)}return[...map.values()].sort((a,b)=>String(b.updatedAt||b.createdAt||b.date||'').localeCompare(String(a.updatedAt||a.createdAt||a.date||'')))}"
if old not in text:
    raise SystemExit('old mergeRealtimeRecords not found')
app.write_text(text.replace(old,new,1))

check = Path('tests/ready_edit_react_check.py')
t = check.read_text()
if 'const map=new Map<string,QcRecord>()' not in t:
    t += '\nassert "const map=new Map<string,QcRecord>()" in app\nassert "map.set(record.id,record)" in app\n'
check.write_text(t)
