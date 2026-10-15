from pathlib import Path
import math
root=Path(__file__).resolve().parents[1]
source=(root/'src'/'nozzlePerformance.ts').read_text(encoding='utf-8')
panel=(root/'src'/'NozzleCalculatorPanel.tsx').read_text(encoding='utf-8')
workspace=(root/'src'/'NozzleCalculatorWorkspace.tsx').read_text(encoding='utf-8')
resource=(root/'src'/'MasterOperationalResourcePanel.tsx').read_text(encoding='utf-8')
importer=(root/'src'/'NozzleSpecificationImportPanel.tsx').read_text(encoding='utf-8')
parser=(root/'src'/'nozzleSpecificationImport.ts').read_text(encoding='utf-8')
portal=(root/'src'/'PortalRouter.tsx').read_text(encoding='utf-8')
rules=(root/'firestore.rules').read_text(encoding='utf-8')

for token in [
    "NOZZLE_SPEC_COLLECTION='master_nozzle_specs'",
    "export function findNozzleSpec",
    "export function matchingNozzleCode",
    "nozzleSpecFromData",
    "return 600*flowLpm/(rateLha*spacingMeters)",
    "source:exact?'tabel':'estimasi debit'",
    "droplet:exact?exact.droplet:null",
]:
    assert token in source, f'Missing dynamic nozzle calculation token: {token}'

# A reference dataset may not be hardcoded into the calculator: upload is the source of truth.
assert 'TTI60_NOZZLES' not in source
assert 'export function canonicalNozzleCode' in source
assert "const tti=clean.match(/^(TTI60)(110)(\\d+)$/)" in source
assert 'left===right' in source
assert 'TTI60-11025' not in panel or 'Nozzle digunakan' in panel
assert 'TTI60_NOZZLES' not in panel
assert "code:'TTI60-11004VP',color:'Merah',flow:" not in source
assert math.isclose(600*1.82/(400*.508),5.374015748,abs_tol=1e-7)
assert math.isclose(600*2.27/(400*.508),6.702755906,abs_tol=1e-7)

for token in [
    'Nozzle digunakan','Water rate (L/ha)','Target kategori droplet',
    'Jarak nozzle (cm)','Jumlah nozzle aktif','Kecepatan operasional min',
    'Kecepatan operasional maks','Kecepatan preferensi','Pengaturan tekanan',
    'Otomatis','Manual (bar)','Tekanan aktual yang digunakan (bar) — wajib diisi',
    'Tidak ada kombinasi tekanan + droplet','Kategori droplet pada tekanan',
    'Alternatif tekanan pada nozzle','Spesifikasi hasil upload',
    'Master Nozzle aktif yang memiliki spesifikasi',
]:
    assert token in panel, f'Missing nozzle calculator display token: {token}'

for token in ['collection(firestoreDb,NOZZLE_SPEC_COLLECTION)','loadOperationalResources(\'nozzle\')','<NozzleCalculatorPanel resources={resources} specs={specs}/>']:
    assert token in workspace, f'Standalone calculator not sourcing Firestore: {token}'

for token in ['parseNozzleWorkbook','Konfirmasi Update / Import Nozzle','sourceFileName:preview.fileName',
              'master_nozzle_specs' if False else 'NOZZLE_SPEC_COLLECTION',
              'writeBatch(db)','OPERATIONAL_RESOURCE_COLLECTIONS.nozzle',
              'matchingNozzleCode(row.name,spec.code)']:
    assert token in importer, f'Uploader token missing: {token}'

for token in ['warna nozzle','jenis nozzle','tekanan (bar)','ukuran droplet','lerap rating','debit (l/menit)',
              'const headerIndex=rows.findIndex','seen.has(key)','group.points.push(point)']:
    assert token in parser, f'Excel parser token missing: {token}'

assert "const[activateInactive,setActivateInactive]=useState(false)" in importer
assert "matchingNozzleCode(row.name,spec.code)" in importer
assert "registered&&activateInactive&&!matches.some(row=>row.active)" in importer
assert "INACTIVE'+(activateInactive?' → ACTIVE':' (tetap)')" in importer
assert "NOZZLE_SPEC_COLLECTION" in resource
assert "nozzleSpecs.find(item=>matchingNozzleCode(row.name,item.code))" in resource
assert "nama untuk model sama" in resource
assert 'inactiveWithSpecs=useMemo' in resource
assert 'async function activateImportedNozzles()' in resource
assert 'Aktifkan {inactiveWithSpecs.length} nozzle dari Excel' in resource
assert "aliases.some(row=>row.active)" in resource
assert 'writerContext(user)' in resource
assert 'writeBatch(context.db)' in resource
assert 'Nozzle tanpa spesifikasi tidak diubah' in resource
assert "kind==='nozzle'&&<NozzleSpecificationImportPanel user={user}" in resource
assert '<NozzleCalculatorPanel' not in resource
assert "dataView==='nozzle-calculator'" in portal
assert 'Kalkulator Nozzle' in portal
assert 'match /master_nozzle_specs/{specId}' in rules
print('Nozzle calculator separate menu and Firestore Excel upload regression: OK')
