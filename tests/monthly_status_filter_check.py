from pathlib import Path

root=Path(__file__).resolve().parents[1]
panel=(root/'src'/'MonthlyPlanListPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "function statusTone(value:string,cancelled=false)",
    "const statusCounts=useMemo",
    'className="monthly-compact-filter-grid"',
    'className="monthly-status-filter"',
    "Status · {selectedWeek==='ALL'?'Semua Week':selectedWeek||'Semua Week'}",
    "statusCounts[item]||0",
    "monthly-status-badge monthly-status-",
]:
    assert token in panel, f"Missing Monthly status UI token: {token}"

for token in [
    ".monthly-status-done",
    ".monthly-status-progress",
    ".monthly-status-planned",
    ".monthly-status-over",
    ".monthly-status-cancelled",
    ".monthly-compact-filter-grid",
]:
    assert token in css, f"Missing Monthly status style: {token}"

assert "background:#dcfce7" in css and "color:#166534" in css, "DONE must render green"
print("Monthly status badges and All-Week-aware compact status filter are present.")
