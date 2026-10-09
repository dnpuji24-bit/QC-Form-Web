from pathlib import Path

root = Path(__file__).resolve().parents[1]
importer = (root / 'src' / 'MasterPaddockImportPanelV2.tsx').read_text(encoding='utf-8')
listing = (root / 'src' / 'MasterPaddockListPanel.tsx').read_text(encoding='utf-8')

for token in [
    'type VarietyArea={variety:string;areaHa:number}',
    'varietyBreakdown:VarietyArea[]',
    'varietyAreaTotalHa:number',
    "function plantingRowKind(row:SheetRow):'PRIMARY'|'SUPPLEMENTAL'|'IGNORE'",
    "if(activity.includes('harvest'))return'IGNORE'",
    "if(activity.includes('sulam'))return'SUPPLEMENTAL'",
    "if(activity.includes('plant')||activity.includes('tanam'))return'PRIMARY'",
    "function isSupplementalPlantingRow",
    "if(cycle===0)cycle=1;else if(harvestSeenSincePlant&&!event.supplemental)",
    'const primaryPlants=currentPlants.filter',
    'const currentPlantProgress=round(currentPlants.reduce',
    'const areaPlanted=currentPlantProgress',
    'Area Plan mengikuti jumlah Progres (Ha) by PID',
    'function varietyBreakdownFromRows',
    "rowValue(item.row,'Variety')",
    "rowValue(item.row,'Progres (Ha)'",
    'varietyBreakdownFromRows(currentPlants)',
    'sourceAreaPaddockRef:sourceAreaPaddock?round(sourceAreaPaddock):null',
    'varietyBreakdown:row.varietyBreakdown',
    'varietyAreaTotalHa:row.varietyAreaTotalHa',
    'Variety / Luas',
    'Total Variety',
    'Total Progress PID',
]:
    assert token in importer, f'Missing Master Paddock progress/variety token: {token}'

assert "activity.includes('harvest')||activity.includes('sulam')" not in importer
assert "Area Plan memakai Area Paddock (Ha), bukan penjumlahan Progres." not in importer
assert "Sulam ikut dihitung sebagai progress tanam tambahan" in importer

for token in [
    'function varietyFromData',
    'row.varietyBreakdown.forEach',
    'Variety / Luas Tertanam',
    'Total Variety',
    'Total Progress PID',
    'Sisa ke Total',
    'Area Plan / Σ Progress',
    'Baris Sulam ikut dihitung',
    'Upload ulang Master Paddock untuk merekam luas per variety.',
]:
    assert token in listing, f'Missing Master Paddock progress-based detail token: {token}'

assert 'varietyBreakdown.map(item=>item.variety)' in listing
assert 'Math.max(row.areaPlantedHa-varietyTotal,0)' in listing
print('Master Paddock variety/progress check: OK')
