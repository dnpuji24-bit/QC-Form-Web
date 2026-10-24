from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')

for token in [
    "const manualMaster=work.sourceType==='MONTHLY'?selectedMaster:null",
    "const description=work.sourceType==='MONTHLY'?(selected?.description||selectedMaster?.description||''):groupActivity",
    "const components=work.sourceType==='MONTHLY'?((selected?.componentsSnapshot?.length?selected.componentsSnapshot:selectedMaster?.componentsSnapshot)||[]):[]",
    "const materials=work.sourceType==='MONTHLY'?materialLinesFromComponents(components,area):[]",
    "Kegiatan & bahan tidak diperlukan untuk ADHOC / SUPPORT.",
    "Tidak perlu memilih Kegiatan atau memasukkan bahan untuk sumber",
    "materials:isMonthly?row.materials:[]",
]:
    assert token in daily, f'Missing ADHOC/SUPPORT simplified-input token: {token}'

assert "Pilih Kegiatan dari Master Activity untuk setiap paddock." not in daily
assert "const invalidTask=info.pids.find" not in daily

print('ADHOC/SUPPORT Daily input does not require per-PID Kegiatan or material selection.')
