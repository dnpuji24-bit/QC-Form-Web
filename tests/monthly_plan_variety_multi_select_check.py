from pathlib import Path

source=(Path(__file__).resolve().parents[1]/'src'/'MonthlyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
css=(Path(__file__).resolve().parents[1]/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    'type VarietyArea={variety:string;areaHa:number}',
    'varietyBreakdown:VarietyArea[]',
    'varieties?:string[]',
    'function varietyBreakdownFromData',
    'selectedVarieties',
    'selectedVarietyDetails',
    'selectedPlantArea',
    'toggleVariety(',
    'selectAllVarieties(',
    'clearVarieties(',
    'VARIETAS APLIKASI',
    'Bisa memilih lebih dari satu varietas. Target plan tidak dibatasi oleh luas plant.',
    'Pilih Semua',
    "selectedVarieties:info.selectedVarieties",
    "selectedVarietyDetails:info.selectedVarietyDetails",
    "selectedPlantAreaHa:info.selectedPlantArea",
    "masterVarietyBreakdown:p.varietyBreakdown",
]:
    assert token in source, f'Missing Monthly multi-variety token: {token}'

assert "x.target>x.paddock.areaPaddockHa+0.0001" not in source
assert "melebihi Area Paddock" not in source
assert "Target lebih besar dari luas varietas dipilih tetap diperbolehkan." in source
assert "info.target>info.paddock.plantAreaHa" in source

for token in [
    'Monthly multi-variety selector',
    '.monthly-variety-chip',
    '.monthly-variety-chip.selected',
    '.monthly-selected-variety-total',
]:
    assert token in css, f'Missing Monthly multi-variety CSS token: {token}'

print('Monthly multi-variety check passed: clickable multi-select varieties and target area above plant area are allowed.')
