from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'src'/'qcDailyPlanSource.ts').read_text(encoding='utf-8')
spray=(root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
fert=(root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')

assert "export function qcShiftValue(value:unknown)" in source
for form in [spray,fert]:
    assert "mergeResourceNames(['1','2'],dailyPlanRows.map(p=>qcShiftValue(p.shift)).filter(Boolean)" in form
    assert "<label>Shift<select value={shift} onChange={e=>changeShift(e.target.value)}>" in form
    assert "function changeShift(value:string){" in form
    assert "const next=qcShiftValue(value)||value" in form
    assert "if(next!==qcShiftValue(shift))" in form
    assert "setShift(next)" in form
    assert 'aria-label="Daily Plan sumber Shift 1"' in form
    assert "qcShiftValue(shift)==='2'" in form
assert "if(next!==qcShiftValue(shift)){setCards(old=>old.map(c=>({...c,dailyPlanId:'',monthlyPlanLineId:''})))}" in spray
assert "if(next!==qcShiftValue(shift))invalidateLinks();setShift(next)" in fert
assert "function invalidateLinks(){setCards(old=>old.map(c=>({...c,dailyPlanId:'',monthlyPlanLineId:'',type:''})))}" in fert
print("QC shift selector: normalized explicit shift, stale source invalidation and separate carryover picker: OK")
