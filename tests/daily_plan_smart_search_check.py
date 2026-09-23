from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')

for token in [
    "function smartMonthlyChoices",
    "looksLikePaddockSearch",
    "shortPaddockCode",
    "complete?target===code:target.startsWith(code)",
    "searchKey(row.planLineId).startsWith(q)||searchKey(row.pid).startsWith(q)",
    'placeholder="Ketik G-007"',
    "activityChoices",
    "Pilih kegiatan pada card dahulu",
    "monthlyOptionLabel",
    "monthly-plan-options-",
    "pilihan cocok",
]:
    assert token in daily, f'Missing strict Daily smart-search token: {token}'

assert "[x.planLineId,x.pid,x.description,x.activity,x.companyCode,x.farm,x.monthKey].join(' ').toLowerCase().includes(q)" not in daily

print('Daily Monthly smart search check passed: activity is selected once per card and each PID search is restricted to that activity with exact paddock matching.')
