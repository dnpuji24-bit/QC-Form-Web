from pathlib import Path
import re, math
root=Path(__file__).resolve().parents[1]
source=(root/'src'/'nozzlePerformance.ts').read_text(encoding='utf-8')
panel=(root/'src'/'NozzleCalculatorPanel.tsx').read_text(encoding='utf-8')
resource=(root/'src'/'MasterOperationalResourcePanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

# TeeJet user-supplied workbook page 21: verify known pressure/flow/droplet points.
for token in [
    "code:'TTI60-11004VP',color:'Merah',flow:[1.12,1.29,1.58,1.82,2.04,2.23,2.41],drop:['UC','UC','UC','XC','XC','VC','VC']",
    "code:'TTI60-11005VP',color:'Coklat',flow:[1.39,1.61,1.97,2.27,2.54,2.79,3.01],drop:['UC','UC','UC','XC','XC','VC','VC']",
    "const PRESSURES=[1.5,2,3,4,5,6,7]",
    "source:exact?'tabel':'estimasi debit'",
    "droplet:exact?exact.droplet:null",
    "const normalized=name.toUpperCase().replace(/[^A-Z0-9]/g,'')",
    "normalized.startsWith(prefix)&&suffixes.has(normalized.slice(prefix.length))",
    "return 600*flowLpm/(rateLha*spacingMeters)",
]:
    assert token in source, f'Missing TeeJet calibration token: {token}'

# 400 L/ha, 50.8cm: red at 4bar=1.82lpm, brown at 4bar=2.27lpm.
assert math.isclose(600*1.82/(400*.508),5.374015748,abs_tol=1e-7)
assert math.isclose(600*2.27/(400*.508),6.702755906,abs_tol=1e-7)

for token in [
    "NozzleCalculatorPanel",
    "Nozzle digunakan",
    "Water rate (L/ha)",
    "Target kategori droplet",
    "Jarak nozzle (cm)",
    "Jumlah nozzle aktif",
    "Kecepatan operasional min",
    "Kecepatan operasional maks",
    "Kecepatan preferensi",
    "Pengaturan tekanan",
    "Otomatis",
    "Manual (bar)",
    "Tekanan aktual yang digunakan (bar) — wajib diisi",
    "Tidak ada kombinasi tekanan + droplet",
    "Kategori droplet pada tekanan",
    "Alternatif tekanan pada nozzle",
    "Sumber: TeeJet Spray Tips Pocket Guide",
]:
    assert token in panel, f'Missing user-facing Nozzle calculator token: {token}'
assert "kind==='nozzle'&&<NozzleCalculatorPanel resources={rows}/>" in resource
assert "Master nozzle performance calculator" in css
print('Nozzle performance calculator regression: OK')
