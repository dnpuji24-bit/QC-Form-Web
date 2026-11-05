from pathlib import Path
root=Path(__file__).resolve().parents[1]
spray=(root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
fert=(root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')

for form,kind in [(spray,'spray'),(fert,'fertilizer')]:
    assert f"dailyPlansForQc(dailyPlanRows,'{kind}','')" in form
    assert f"dailyPlansForQc(dailyPlanRows,'{kind}',shift)" not in form
    assert "function changeShift(value:string){setShift(qcShiftValue(value)||value)}" in form
    assert "allowed=new Set(nextPlans.map(p=>p.dailyPlanId))" not in form
    assert "tersedia untuk tanggal ini." in form

assert "const sprayDailyPlans=useMemo(()=>dailyPlansForQc(dailyPlanRows,'spray',''),[dailyPlanRows])" in spray
assert "const fertDailyPlans=useMemo(()=>dailyPlansForQc(dailyPlanRows,'fertilizer',''),[dailyPlanRows])" in fert
print("QC Paddock source is date-wide and independent from selected Shift: OK")
