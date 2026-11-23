from pathlib import Path

root=Path(__file__).resolve().parents[1]
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')
summary=(root/'src'/'PlanSummaryDashboard.tsx').read_text(encoding='utf-8')
monthly=(root/'src'/'MonthlyPlanListPanel.tsx').read_text(encoding='utf-8')
actual=(root/'src'/'ActualPlanListPanel.tsx').read_text(encoding='utf-8')
reconcile=(root/'src'/'PlanReconciliationPanel.tsx').read_text(encoding='utf-8')
paddock=(root/'src'/'MasterPaddockListPanel.tsx').read_text(encoding='utf-8')
activity=(root/'src'/'MasterActivityListPanel.tsx').read_text(encoding='utf-8')
activity_import=(root/'src'/'MasterActivityImportPanel.tsx').read_text(encoding='utf-8')

assert "premium-filter-panel" in summary
assert "premium-filter-panel compact-filter-panel" in monthly
assert "premium-search-filter" in monthly
assert "premium-filter-panel compact-filter-panel" in actual
assert "premium-filter-panel compact-filter-panel" in reconcile
assert "premium-record-filters" in paddock
assert "premium-date-filters" in paddock
assert "premium-record-filters" in activity
assert "premium-inline-filters" in activity_import
assert "premium-inline-filter" in activity_import

for token in [
    "Premium filter system across Planning & Master Data",
    ".filter-grid-auto",
    ".premium-record-filters",
    ".premium-date-filters",
    ".premium-inline-filters",
    ".premium-search-filter",
    ".summary-paddock-filter",
    "Smaller premium filters on mobile",
    "min-height:27px!important",
    "font-size:.74rem!important",
]:
    assert token in css, f'Missing premium filter system token: {token}'

assert "@media(max-width:760px)" in css
assert ".premium-filter-grid,\n  .filter-grid-auto" in css
assert ".monthly-quick-search-row{flex-direction:row!important" in css

print("Premium filter system check passed: Summary, Monthly, Actual, Reconciliation, Master Paddock, Master Activity, and import filters share a modern UI with compact mobile sizing.")
