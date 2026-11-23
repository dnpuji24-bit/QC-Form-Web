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
    "export function dailyPlansForQcSession(",
    "export function resolveQcSessionPlan(",
    "export function qcShiftOneCarryoverCandidates(",
    "qcDailyKind(row)===kind&&row.date===d&&shiftKey(row.shift)===s&&sessionKey(row.foreman)===f&&Boolean(row.dailyPlanId)",
    "if(!selectedId||rows.filter(row=>row.dailyPlanId===selectedId).length!==1)return null",
    "qcSessionPlanMatches(rows,pid,activity,description).find(row=>row.dailyPlanId===selectedId)||null",
    "if(shiftKey(actualShift)!=='2'||!text(date)||!sessionKey(actualForeman))return[]",
    "qcDailyKind(row)===kind&&row.date===text(date)&&shiftKey(row.shift)==='1'",
    "monthlyPlanLineId",
    "dailyPlanId",
    "function shiftKey(value:unknown)",
    "export function qcShiftValue(value:unknown)",
    "'shift2':'2'","'s2':'2'","'2.0':'2'","'shiftii':'2'",
]:
    assert token in source, f"Missing Daily Plan QC source token: {token}"

for form,name,kind in [(spray,'Spraying','spray'),(fert,'Fertilizer','fertilizer')]:
    for token in [
        "loadQcDailyPlans(date)",
        "loadedPlanDate===date?dailyPlansForQcSession(dailyPlanRows,'"+kind+"',date,shift,mandor):[]",
        "loadedPlanDate===date?qcShiftOneCarryoverCandidates(dailyPlanRows,'"+kind+"',date,shift,mandor):[]",
        "qc-entry-source","Daily Plan ID","Monthly Plan ID",
        'aria-label="Daily Plan sumber Shift 1"',
        "dailyPlanId:card.dailyPlanId","monthlyPlanLineId:card.monthlyPlanLineId",
        "dailyPlanLinkStatus:","plannedDailyAreaHa:cardDailyPlan?.areaHa",
        "date,shift","name:mandor","const cardDailyPlan=planForCard(card)",
        "const problem=planProblem(c)","Daily Plan QC Uploaded tidak boleh dipindah melalui koreksi ini.",
        "dailyPlanRows.map(p=>qcShiftValue(p.shift)).filter(Boolean)",
        "mergeResourceNames(['1','2']",
        "<label>Shift<select value={shift} onChange={e=>changeShift(e.target.value)}>",
    ]:
        assert token in form, f"{name}: missing {token}"
    assert "dailyPlansForQc(dailyPlanRows," not in form, f"{name}: legacy date-wide selection must not bypass session mapping"

assert "linkedDailyPlan.materials" in spray
assert "cardDailyPlan?.materials" in spray
assert "resolveQcSessionPlan(eligiblePlans,c.paddock,c.activity,c.deskripsi,c.dailyPlanId)" in spray
assert "qcSessionPlanMatches(sprayDailyPlans,value,card.activity,card.deskripsi)" in spray
assert "matches.length===1?resolveQcSessionPlan" in spray
assert "selectableCarryover.find(p=>p.dailyPlanId===e.target.value)" in spray
assert "fertilizerChoices(matchingPlan,masterProducts,productsLoaded)" in fert
assert "fertilizerChoiceByName(value,fertilizerOptions)" in fert
assert "jenisPupuk:value,dosis:choice?String(choice.dosePerHa):f.dosis" in fert
assert "eligiblePlans.filter(p=>p.dailyPlanId===id).length===1" in fert
assert "const p=uniquePlan(c.dailyPlanId)" in fert
assert "sourceId?uniquePlan(sourceId):candidates.length===1?uniquePlan(candidates[0].dailyPlanId):null" in fert
assert "linkDailyPlan(card.id,p.pid,p.activity,p.dailyPlanId)" in fert

for token in ["dailyPlanId?: string","monthlyPlanLineId?: string","dailyPlanLinkStatus?: string","plannedDailyAreaHa?: number | string"]:
    assert token in types, f"Missing QcRecord linkage type: {token}"

assert ".qc-daily-source-status" in styles
assert ".qc-daily-link-grid" in styles
print("QC Daily Plan source check passed: session, explicit same-date carryover, exact source ID, materials and executor linkage.")
