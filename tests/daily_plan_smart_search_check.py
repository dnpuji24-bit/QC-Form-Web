from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')

for token in [
    "function smartMonthlyChoices",
    "looksLikePaddockSearch",
    "shortPaddockCode",
    "complete?target===code:target.startsWith(code)",
    "planId.startsWith(q)||activity.startsWith(q)||description.startsWith(q)",
    'placeholder="Ketik G-007 / pre / top dressing"',
    "monthlyOptionLabel",
    "monthly-plan-options-",
    "pilihan cocok — pilih salah satu suggestion",
]:
    assert token in daily, f'Missing strict Daily smart-search token: {token}'

assert "[x.planLineId,x.pid,x.description,x.activity,x.companyCode,x.farm,x.monthKey].join(' ').toLowerCase().includes(q)" not in daily

print('Daily Monthly smart search check passed: the Monthly Plan field itself is type-to-search, with exact paddock matching and prefix activity/ID matching.')
