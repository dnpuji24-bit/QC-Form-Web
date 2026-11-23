from pathlib import Path

root=Path(__file__).resolve().parents[1]
panel=(root/'src'/'MasterMaterialImportExportPanel.tsx').read_text(encoding='utf-8')
manage=(root/'src'/'MasterActivityManagePanel.tsx').read_text(encoding='utf-8')
workspace=(root/'src'/'MasterActivityWorkspace.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    'Update / Import & Export Bahan',
    "collection(firestoreDb,'master_materials')",
    "XLSX.utils.book_append_sheet(workbook,sheet,'Bahan')",
    "Master_Bahan_",
    "Update / Import Bahan (.xlsx / .xls)",
    "Confirm Update / Import Bahan",
    "Khusus collection",
    "Data yang tidak ada di file tidak akan dihapus",
    "IMPORT BAHAN",
    "master_material_import_logs",
    "source:'MATERIAL_IMPORT'",
    "Activity ACTIVE kehilangan pasangan Bahan Aktif + Satuan",
]:
    assert token in panel, f'Missing dedicated Master Bahan import/export token: {token}'

assert "MasterMaterialImportExportPanel" in manage
assert "view==='MATERIAL'" in manage
assert "Update / Import Activity" in workspace

for token in [
    'Dedicated Master Bahan import/export',
    '.material-io-panel',
    '.material-export-button',
    '.material-io-grid',
]:
    assert token in css, f'Missing Master Bahan import/export CSS token: {token}'

print('Master Bahan dedicated update/import/export check: OK')
