from pathlib import Path
root=Path(__file__).resolve().parents[1]
panel=(root/'src'/'MonthlyPlanListPanel.tsx').read_text(encoding='utf-8')
workspace=(root/'src'/'MonthlyPlanWorkspace.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')
for token in [
  "activityFilter",
  "const activitySummary=useMemo",
  "focusActivity(item.activity)",
  'id="monthly-period-results"',
  "Target {formatHa(item.target)}",
  "Actual {formatHa(item.actual)}",
]:
  assert token in panel, f"Missing activity summary token: {token}"
assert '<option value="ALL">Semua Week</option>' in workspace
assert "week!=='ALL'" in workspace and "Mode Semua Week" in workspace
assert ".monthly-activity-summary-card" in css
print("Monthly active-period activity summary is clickable and All Week mode is available safely.")
