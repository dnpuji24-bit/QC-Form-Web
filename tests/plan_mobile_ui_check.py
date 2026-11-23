from pathlib import Path

root=Path(__file__).resolve().parents[1]
portal=(root/'src'/'PortalRouter.tsx').read_text(encoding='utf-8')
portal_css=(root/'src'/'data-unm-menu.css').read_text(encoding='utf-8')
plan=(root/'src'/'PlanWorkspace.tsx').read_text(encoding='utf-8')
daily_ws=(root/'src'/'DailyPlanWorkspace.tsx').read_text(encoding='utf-8')
monthly_ws=(root/'src'/'MonthlyPlanWorkspace.tsx').read_text(encoding='utf-8')
actual_ws=(root/'src'/'ActualPlanWorkspace.tsx').read_text(encoding='utf-8')
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
field_css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in ['aria-label="Menu Data UnM"',"data-unm-menu-group","data-unm-menu-item","compact-page-head","portal-workspace-view"]:
    assert token in portal, f'Missing compact Data UnM token: {token}'
for token in [".data-unm-menu-item:focus-visible",".compact-page-head","@media (max-width: 600px)","grid-template-columns: 1fr"]:
    assert token in portal_css, f'Missing compact Data UnM CSS: {token}'

assert "plan-section-menu" in plan
for name, workspace in [("Daily", daily_ws), ("Monthly", monthly_ws), ("Actual", actual_ws)]:
    assert "plan-antd-nav" in workspace and f'aria-label="Menu {name} Plan"' in workspace

for token in [
    "daily-mobile-workspace",
    "daily-form-toolbar",
    "Jadwal & Activity",
    "Tenaga & Alat",
    "daily-schedule-grid",
    "daily-resource-grid",
    "{totals.ready} / {totals.breakdown} / {totals.standby}",
]:
    assert token in daily, f'Missing compact Daily mobile token: {token}'

for token in [
    ".daily-form-group",
    ".daily-schedule-grid",
    ".daily-resource-grid",
    ".daily-single-form-actions",
]:
    assert token in field_css, f'Missing compact Plan/Daily CSS: {token}'

print('Mobile Plan UI check passed: Data UnM uses compact shortcuts, all Plan workspaces use horizontal navigation, and Daily input is split into touch-friendly grouped sections.')
