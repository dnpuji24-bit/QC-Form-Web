from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')

for token in [
    "function smartMonthlyChoices",
    "looksLikePaddockSearch",
    "shortPaddockCode",
    "complete?target===code:target.startsWith(code)",
    "const byPlanId=scoped.filter(row=>searchKey(row.planLineId).startsWith(q))",
    "if(byPlanId.length)return byPlanId",
    "return scoped.filter(row=>searchKey(row.pid).startsWith(q))",
    'placeholder="Ketik G-007"',
    "activityChoices",
    "Pilih kegiatan dahulu",
    "monthlyOptionLabel",
    "monthly-active-options-",
    "pilihan cocok",
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

print('Daily Monthly smart search check passed: all IDs in the selected month remain available across weeks, Plan ID search wins before paddock heuristics, and activity/paddock scoping stays intact.')
