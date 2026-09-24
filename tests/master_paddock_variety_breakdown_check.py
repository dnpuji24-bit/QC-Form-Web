from pathlib import Path

root = Path(__file__).resolve().parents[1]
importer = (root / 'src' / 'MasterPaddockImportPanelV2.tsx').read_text(encoding='utf-8')
listing = (root / 'src' / 'MasterPaddockListPanel.tsx').read_text(encoding='utf-8')

for token in [
    'type VarietyArea={variety:string;areaHa:number}',
    'varietyBreakdown:VarietyArea[]',
    'varietyAreaTotalHa:number',
    'function varietyBreakdownFromRows',
    "rowValue(item.row,'Variety')",
    "rowValue(item.row,'Progres (Ha)'",
    'varietyBreakdownFromRows(currentPlants)',
    'varietyBreakdown:row.varietyBreakdown',
    'varietyAreaTotalHa:row.varietyAreaTotalHa',
    'Variety / Luas',
    'Total Variety',
    'Total Paddock',
]:
    assert token in importer, f'Missing Master Paddock variety import token: {token}'

for token in [
    'function varietyFromData',
    'row.varietyBreakdown.forEach',
    'Variety / Luas Tertanam',
    'Total Variety',
    'Total Paddock',
    'Sisa ke Total',
    'Upload ulang Master Paddock untuk merekam luas per variety.',
]:
    assert token in listing, f'Missing Master Paddock variety detail token: {token}'

assert 'varietyBreakdown.map(item=>item.variety)' in listing
assert 'Math.max(row.areaPlantedHa-varietyTotal,0)' in listing
print('Master Paddock variety breakdown check: OK')
