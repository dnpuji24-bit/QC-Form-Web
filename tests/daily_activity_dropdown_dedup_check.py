from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "function normalizedActivityText(value:unknown)",
    ".normalize('NFKC')",
    r"/[\u200B-\u200D\uFEFF]/g",
    "function uniqueActivityNames(values:unknown[],input='')",
    "activityChoices(rows:Monthly[],masters:MasterActivity[],input:string){return uniqueActivityNames",
    "masters.filter(item=>item.active).map(item=>item.activity)",
    "const[activityOpen,setActivityOpen]=useState(false)",
    "function selectActivity(value:string)",
    'autoComplete="off"',
    'aria-autocomplete="list"',
    'id="daily-activity-options"',
    "daily-activity-options",
    "Tidak ada activity yang cocok",
]:
    assert token in daily, f"Missing activity dropdown/dedup token: {token}"

assert 'list="daily-active-activities"' not in daily
assert '<datalist id="daily-active-activities">' not in daily
for token in [
    "Daily Plan searchable activity dropdown",
    ".daily-activity-combobox",
    ".daily-activity-options",
    ".daily-activity-toggle",
]:
    assert token in css, f"Missing activity dropdown CSS: {token}"

print("Daily Plan unique searchable activity dropdown checks: OK")
