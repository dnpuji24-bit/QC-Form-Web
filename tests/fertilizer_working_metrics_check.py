from pathlib import Path

root=Path(__file__).resolve().parents[1]
fert=(root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')
types=(root/'src'/'types.ts').read_text(encoding='utf-8')
code=(root/'Code.gs').read_text(encoding='utf-8')

for token in [
    "startTime:string;endTime:string",
    "function timingFor(card:UnitCard)",
    "Total Working",
    "Total HOLD",
    "Working Efektif",
    "Produktivitas",
    "Ha/Jam",
    "workingDurationMinutes:timing.ready?timing.working:0",
    "holdTotalMinutes:timing.ready?timing.total:0",
    "effectiveWorkingMinutes:timing.ready?timing.effective:0",
    "productivityHaPerHour",
    "totalHaForDose/(timing.effective/60)",
    "fertilizer-working-stats",
]:
    assert token in fert, f"Missing fertilizer working metric token: {token}"

assert "productivityHaPerHour?: number" in types
assert "rec.startTime||'',rec.endTime||''" in code
assert "FERT_HEADERS: ['Tanggal','Shift','Name','Name of Assistan','Status','Start Time ','End Time'" in code
print('Fertilizer working/HOLD/effective/productivity checks: OK')
