from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'src'/'qcDailyPlanSource.ts').read_text(encoding='utf-8')
spray=(root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
fert=(root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')

assert "export function qcShiftValue(value:unknown)" in source
for form in [spray,fert]:
    assert "mergeResourceNames(['1','2'],dailyPlanRows.map(p=>qcShiftValue(p.shift)).filter(Boolean)" in form
    assert "<label>Shift<select value={shift} onChange={e=>changeShift(e.target.value)}>" in form
    assert "function changeShift(value:string){setShift(qcShiftValue(value)||value)}" in form
    assert "allowed=new Set(nextPlans.map(p=>p.dailyPlanId))" not in form
print("QC shift selector independent from Paddock filtering: OK")
