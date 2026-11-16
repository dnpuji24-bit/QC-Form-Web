from pathlib import Path
root=Path(__file__).resolve().parents[1]
spray=(root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
fert=(root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')
source=(root/'src'/'qcDailyPlanSource.ts').read_text(encoding='utf-8')

# Date-wide fetching is retained, but default choices are session scoped.
# Shift 1 sources are offered separately for explicit Shift 2 carryover.
assert "where('date','==',date)" in source
assert "row.date===d&&shiftKey(row.shift)===s&&sessionKey(row.foreman)===f" in source
assert "if(shiftKey(actualShift)!=='2'" in source
assert "row.date===text(date)&&shiftKey(row.shift)==='1'" in source
for form,kind in [(spray,'spray'),(fert,'fertilizer')]:
    assert f"loadedPlanDate===date?dailyPlansForQcSession(dailyPlanRows,'{kind}',date,shift,mandor):[]" in form
    assert f"loadedPlanDate===date?qcShiftOneCarryoverCandidates(dailyPlanRows,'{kind}',date,shift,mandor):[]" in form
    assert f"dailyPlansForQc(dailyPlanRows,'{kind}','')" not in form
    assert 'aria-label="Daily Plan sumber Shift 1"' in form
    assert "qcShiftValue(shift)==='2'" in form
    assert "Balance belum diverifikasi sistem." in form
assert "const eligiblePlans=[...sprayDailyPlans,...carryoverPlans]" in spray
assert "qcSessionPlanMatches(sprayDailyPlans,value,card.activity,card.deskripsi)" in spray
assert "const eligiblePlans=useMemo(()=>[...fertDailyPlans,...carryoverPlans]" in fert
assert "const candidates=fertDailyPlans.filter(" in fert
assert "sourceId?uniquePlan(sourceId):candidates.length===1?" in fert
print("QC Paddock: date-wide fetch, session-scoped choices, explicit Shift 1 to Shift 2 carryover: OK")
