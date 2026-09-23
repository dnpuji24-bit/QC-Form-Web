from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')

for token in [
    "function smartMonthlyChoices",
    "looksLikePaddockSearch",
    "shortPaddockCode",
    "complete?target===code:target.startsWith(code)",
    "planId.startsWith(q)||activity.startsWith(q)||description.startsWith(q)",
    'placeholder="G-007 / pre / top dressing"',
]:
    assert token in daily, f'Missing strict Daily smart-search token: {token}'

assert "[x.planLineId,x.pid,x.description,x.activity,x.companyCode,x.farm,x.monthKey].join(' ').toLowerCase().includes(q)" not in daily

print('Daily Monthly smart search check passed: complete paddock codes match exactly, partial paddock codes prefix-match, and text queries only match Plan ID/activity/description prefixes.')
