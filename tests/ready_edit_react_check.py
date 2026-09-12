from pathlib import Path

fert = Path("src/FertilizerForm.tsx").read_text()
spray = Path("src/SprayForm.tsx").read_text()
app = Path("src/App.tsx").read_text()

assert "showReadyProblem(problem)" in fert
assert "Jumlah pupuk dan Hasil Kerja wajib lebih dari 0 sebelum status Ready" in fert
assert "clientRevision:crypto.randomUUID()" in fert
assert "clientRevision:crypto.randomUUID()" in spray

assert "function mergeRealtimeRecords" in app
assert "for(const record of incoming)if(record?.id)map.set(record.id,record)" in app
assert "revision&&(!fresh||String(fresh.clientRevision||'')!==revision)" in app
assert "map.set(record.id,record)" in app
assert "record.saveType!=='ready'" in app

print("Ready edit + optimistic realtime regression check: OK")
