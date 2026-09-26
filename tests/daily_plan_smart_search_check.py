from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')

for token in [
    "function smartMonthlyChoices",
    "compactPaddockKey",
    "shortPaddockCode",
    "const byPlanId=scoped.filter(row=>searchKey(row.planLineId).startsWith(q))",
    "if(byPlanId.length)return byPlanId",
    "full.startsWith(code)",
    "short.startsWith(code)",
    "fullCompact.startsWith(compact)",
    "shortCompact.startsWith(compact)",
    "activityChoices",
    "monthlyOptionLabel",
]:
    assert token in daily, f'Missing strict Daily smart-search token: {token}'

assert "[x.planLineId,x.pid,x.description,x.activity,x.companyCode,x.farm,x.monthKey].join(' ').toLowerCase().includes(q)" not in daily

for token in [
    "function monthBounds",
    "where('monthKey','==',monthKey)",
    "where('startDate','>=',startDate)",
    "where('startDate','<',nextStartDate)",
    "const mergedMonthly=new Map",
    "a.week.localeCompare(b.week",
]:
    assert token in daily, f'Missing Daily Monthly period-loading regression token: {token}'

assert ".slice(0,120)" not in daily, 'Daily Monthly selector must not hide valid IDs behind a fixed 120-row cap.'

# Assert behavior/logic, not mutable UI copy. This avoids false CI failures when labels are reworded.
for token in [
    "['cancel','done','selesai','complete']",
    "!monthlyStatusClosed(row)",
    "((actualByMonthlyId.get(row.planLineId)||0)+row.manualActualAreaHa)<row.targetAreaHa-0.0001",
    "smartMonthlyChoices(selectableMonthly",
]:
    assert token in daily, f'Missing Daily Monthly availability behavior token: {token}'

for token in [
    "type Actual=",
    "monthlyStatusClosed",
    "actualByMonthlyId",
    "selectableMonthly",
    "where('monthlyPlanLineId','in',part)",
    "daily_reports",
    "actualAreaHa:planNum(r.actualAreaHa)",
    "smartMonthlyChoices(selectableMonthly",
]:
    assert token in daily, f'Missing Daily completed-plan filtering token: {token}'

for token in [
    "useRef",
    "activityMonthly",
    "availableMonthly",
    "loadMonthlyActivity",
    "where('description','==',label)",
    "where('activity','==',label)",
    "where('monthlyPlanLineId','in',part)",
]:
    assert token in daily, f'Missing cross-month Daily Monthly lookup token: {token}'


print('Daily Monthly smart search check passed: short PID prefixes such as O, O003, or O-003 resolve active Monthly IDs while availability still respects Actual/manual progress.')
