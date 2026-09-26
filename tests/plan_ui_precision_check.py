from pathlib import Path

root=Path(__file__).resolve().parents[1]
monthly=(root/'src'/'MonthlyPlanWorkspace.tsx').read_text(encoding='utf-8')
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
actual=(root/'src'/'ActualPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "premium-period-selector",
    "monthly-period-badge",
]:
    assert token in monthly, f'Missing Monthly precision UI token: {token}'

for token in [
    "daily-mobile-workspace daily-plan-entry",
    "daily-form-group-title",
    "plan-grid daily-schedule-grid",
    "plan-grid daily-resource-grid",
    "daily-draft-summary",
]:
    assert token in daily, f'Missing Daily precision UI token: {token}'

for token in [
    "actual-plan-entry",
    "actual-single-form",
    "daily-form-group-title",
    "plan-grid daily-schedule-grid actual-schedule-grid",
    "plan-grid daily-resource-grid actual-resource-grid",
    'className="daily-date-field"',
]:
    assert token in actual, f'Missing Actual precision UI token: {token}'

assert "daily-form-group-head" not in actual, "Actual must use the same styled group title as Daily."

for token in [
    "Precision Plan UI system",
    "--plan-control-h:40px",
    ".premium-period-selector",
    ".daily-mobile-workspace .daily-single-form",
    ".actual-plan-entry .actual-schedule-grid",
    ".actual-plan-entry .actual-resource-grid",
    ".daily-draft-summary",
    "grid-template-columns:repeat(3,minmax(0,1fr))!important",
    ".daily-single-form-actions",
]:
    assert token in css, f'Missing shared precision UI CSS token: {token}'

assert "grid-template-areas:" in css
assert '"period period badge"' in css
assert "--plan-control-h-mobile:36px" in css
assert ".daily-draft-summary>div:last-child{grid-column:span 2}" in css

print("Plan UI precision check passed: Monthly period filters, Daily entry/draft summary, and Actual form share aligned compact responsive geometry.")
