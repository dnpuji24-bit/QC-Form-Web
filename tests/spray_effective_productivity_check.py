from pathlib import Path

root=Path(__file__).resolve().parents[1]
spray=(root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
app=(root/'src'/'App.tsx').read_text(encoding='utf-8')

for token in [
    "productivityHaPerHour=timing.ready&&timing.effective>0",
    "n(card.area)/(timing.effective/60)",
    "productivityHaPerHour}",
    'label="Produktivitas Efektif"',
    "Ha/Jam",
]:
    assert token in spray, f"Missing Spray effective productivity token: {token}"

assert "['Produktivitas Efektif',value(record.productivityHaPerHour,' Ha/Jam')]" in app
print('Spray effective Ha/Jam checks: OK')
