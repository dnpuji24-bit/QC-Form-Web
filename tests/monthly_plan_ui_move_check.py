from pathlib import Path

root=Path(__file__).resolve().parents[1]
listing=(root/'src'/'MonthlyPlanListPanel.tsx').read_text(encoding='utf-8')
entry=(root/'src'/'MonthlyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "editMonth",
    'type="month" value={editMonth}',
    "monthKey:editMonth",
    "monthNumber:nextMonthNumber",
    "monthLabel:nextMonthLabel",
    "weekDates(editMonth,editWeek)",
    "Memindahkan bulan tidak mengubah tanggal Daily",
    "monthly-inline-edit-panel",
    "monthly-edit-period-grid",
]:
    assert token in listing, f"Missing Monthly edit/month-move token: {token}"

for token in [
    "monthly-plan-entry",
    "monthly-work-section",
    "monthly-work-card",
    "monthly-add-work-footer",
    "monthly-add-work-button",
    "Tambah Pekerjaan",
]:
    assert token in entry, f"Missing Monthly entry premium token: {token}"

assert entry.index('monthly-add-work-footer') > entry.index('plan-work-list'), "Add work action must sit below the work list."

for token in [
    "Monthly premium edit + compact mobile",
    ".monthly-inline-edit-panel",
    ".monthly-period-list .compact-period-cards",
    ".monthly-plan-entry .plan-grid",
    ".monthly-add-work-button",
]:
    assert token in css, f"Missing Monthly premium/compact CSS token: {token}"

print("Monthly Plan UI check passed: edit can move month/week without changing identity, mobile listing is compact, and Add Work sits below job cards.")
