from pathlib import Path

root=Path(__file__).resolve().parents[1]
web=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
listing=(root/'src'/'DailyPlanListPanel.tsx').read_text(encoding='utf-8')
actions=(root/'src'/'dailyPlanActions.ts').read_text(encoding='utf-8')
actual=(root/'src'/'ActualPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
plan=(root/'src'/'PlanWorkspace.tsx').read_text(encoding='utf-8')

for token in [
    "DAILY PLAN",
    "Ketik G-007",
    "sourceType:'MONTHLY'",
    "ADHOC",
    "SUPPORT",
    "activitySearch",
    "BAHAN & DOSIS ACUAN",
]:
    assert token in web, f'Missing Daily smart/adhoc token: {token}'

for token in [
    "Copy to Actual",
    "Copy to WA",
    "Copy to Date",
    "Pilih Semua Filter",
    "copiedFromDailyPlanId",
    "dailyPlansToWhatsApp",
    "Bahan & Dosis",
]:
    assert token in listing, f'Missing Daily bulk action token: {token}'

for token in [
    "*DAILY PLANNING*",
    "📅 *Tanggal:*",
    "🧪 Bahan:",
    "📊 *Total:*",
]:
    assert token in actions, f'Missing WhatsApp format token: {token}'

assert "Plan ID" not in actions
assert "dailyPlanId" not in actions.split("export function dailyPlansToWhatsApp",1)[1]
assert "prefillDailyPlanIds" in actual
for token in ["manpower:String(row.manpower||0)","unitName:row.unitName||''","unitReady:String(row.unitReady||0)","unitBreakdown:String(row.unitBreakdown||0)","unitStandby:String(row.unitStandby||0)","foreman:selected[0]?.foreman"]:
    assert token in actual, f'Missing Actual prefill token: {token}'
assert "onCopyToActual" in plan

print('Daily Plan action check passed: smart Monthly search, ADHOC input, material review, WhatsApp copy without Plan IDs, Copy to Actual and Copy to Date are wired.')
