from pathlib import Path

root=Path(__file__).resolve().parents[1]
manage=(root/'src'/'MasterActivityManagePanel.tsx').read_text(encoding='utf-8')
listing=(root/'src'/'MasterActivityListPanel.tsx').read_text(encoding='utf-8')
importer=(root/'src'/'MasterActivityImportPanel.tsx').read_text(encoding='utf-8')
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
actual=(root/'src'/'ActualPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
spray=(root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
fert=(root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')
helper=(root/'src'/'masterActivityDefaults.ts').read_text(encoding='utf-8')

for token in [
    "defaultUnitName",
    "defaultShift",
    "defaultForeman",
    "Default Unit",
    "Default Shift",
    "Default Mandor / Foreman",
]:
    assert token in manage, f'Missing Master Activity resource field: {token}'

assert "Default Resource" in listing
assert "Shift {row.defaultShift||'-'}" in listing

for token in [
    "Default Unit','Unit','Kode / Nama Unit','Nama Unit",
    "Default Shift','Shift",
    "Default Mandor','Mandor','Foreman','Nama Mandor','Nama Foreman",
    "defaultUnitName:row.defaultUnitName",
    "defaultShift:row.defaultShift",
    "defaultForeman:row.defaultForeman",
]:
    assert token in importer, f'Missing Master Activity import resource token: {token}'

for token in [
    "masterActivityDefault",
    "defaultUnitName",
    "defaultShift",
    "defaultForeman",
    "Master default: Unit",
]:
    assert token in daily, f'Missing Daily Master Activity resource default token: {token}'

assert "findActivityResourceDefault" in actual
assert "loadActivityResourceDefaults" in actual
assert "masterDefault?.defaultUnitName" in actual
assert "masterDefault?.defaultForeman" in actual

for source,name in [(spray,"SprayForm"),(fert,"FertilizerForm")]:
    assert "loadActivityResourceDefaults" in source, f'{name} must load Firestore Master Activity defaults.'
    assert "findActivityResourceDefault" in source, f'{name} must match Activity defaults.'
    assert "defaultUnitName" in source and "defaultShift" in source and "defaultForeman" in source, f'{name} must apply unit/shift/foreman defaults.'

for token in [
    "loadActivityResourceDefaults",
    "findActivityResourceDefault",
    "defaultUnitName",
    "defaultShift",
    "defaultForeman",
]:
    assert token in helper, f'Missing shared Master Activity default helper token: {token}'

print("Master Activity resource defaults check passed: Unit, Shift, and Mandor defaults are stored/imported and flow into Daily, Actual fallback, Spraying QC, and Fertilizer QC.")
