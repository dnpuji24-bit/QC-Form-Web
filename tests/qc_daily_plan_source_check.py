from pathlib import Path

root=Path(__file__).resolve().parents[1]
source=(root/'src'/'qcDailyPlanSource.ts').read_text(encoding='utf-8')
spray=(root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
fert=(root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')
types=(root/'src'/'types.ts').read_text(encoding='utf-8')
styles=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "collection(firestoreDb,'daily_plans')",
    "where('date','==',date)",
    "dailyPlansForQc",
    "resolveQcDailyPlan",
    "monthlyPlanLineId",
    "dailyPlanId",
]:
    assert token in source, f"Missing Daily Plan QC source token: {token}"

for form,name,kind in [(spray,'Spraying','spray'),(fert,'Fertilizer','fertilizer')]:
    assert "loadQcDailyPlans(date)" in form, f"{name}: date-scoped Daily Plan load missing"
    assert f"dailyPlansForQc(dailyPlanRows,'{kind}',shift)" in form, f"{name}: shift/category Daily Plan filter missing"
    assert "Sumber pekerjaan: Daily Plan" in form, f"{name}: Daily Plan source status missing"
    assert "Daily Plan ID" in form and "Monthly Plan ID" in form, f"{name}: automatic linkage display missing"
    assert "dailyPlanId:" in form and "monthlyPlanLineId:" in form, f"{name}: linkage persistence missing"
    assert "dailyPlanLinkStatus:" in form and "plannedDailyAreaHa:" in form, f"{name}: QC linkage metadata missing"
    assert "setCards(old=>old.map(card=>" in form, f"{name}: automatic link hydration missing"

assert "linkedDailyPlan.materials" in spray
assert "cardDailyPlan?.materials" in spray
assert "matchingPlan?.materials.find" in fert
assert "resolveQcDailyPlan(fertDailyPlans" in fert
assert "pilih pekerjaan yang tersedia dari Daily Plan tanggal/shift aktif" in spray
assert "pilih pekerjaan yang tersedia dari Daily Plan tanggal/shift aktif" in fert

for token in ["dailyPlanId?: string","monthlyPlanLineId?: string","dailyPlanLinkStatus?: string","plannedDailyAreaHa?: number | string"]:
    assert token in types, f"Missing QcRecord linkage type: {token}"

assert ".qc-daily-source-status" in styles
assert ".qc-daily-link-grid" in styles


assert "function shiftKey(value:unknown)" in source
assert "const selectedShift=shiftKey(shift)" in source
assert "const rowShift=shiftKey(row.shift)" in source
for token in ["'shift2':'2'","'s2':'2'","'2.0':'2'","'shiftii':'2'"]:
    assert token in source, f"Missing Shift 2 normalization alias: {token}"


assert "export function qcShiftValue(value:unknown)" in source
for form,name in [(spray,'Spraying'),(fert,'Fertilizer')]:
    assert "dailyPlanRows.map(p=>qcShiftValue(p.shift)).filter(Boolean)" in form, f"{name}: Daily Plan shift options not included"
    assert "mergeResourceNames(['1','2']" in form, f"{name}: Shift 1/2 fallback missing"
    assert "<label>Shift<select value={shift} onChange={e=>changeShift(e.target.value)}>" in form, f"{name}: Shift must be explicit mobile select"
    assert "function changeShift(value:string)" in form, f"{name}: shift-change reset/link guard missing"

print("QC Daily Plan source check passed.")
