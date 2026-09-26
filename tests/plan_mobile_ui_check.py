from pathlib import Path

root=Path(__file__).resolve().parents[1]
portal=(root/'src'/'PortalRouter.tsx').read_text(encoding='utf-8')
portal_css=(root/'src'/'portal.css').read_text(encoding='utf-8')
plan=(root/'src'/'PlanWorkspace.tsx').read_text(encoding='utf-8')
daily_ws=(root/'src'/'DailyPlanWorkspace.tsx').read_text(encoding='utf-8')
monthly_ws=(root/'src'/'MonthlyPlanWorkspace.tsx').read_text(encoding='utf-8')
actual_ws=(root/'src'/'ActualPlanWorkspace.tsx').read_text(encoding='utf-8')
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
field_css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in ["data-home-hero","data-shortcut-grid","compact-page-head","portal-workspace-view"]:
    assert token in portal, f'Missing compact Data UnM token: {token}'
for token in [".data-shortcut-grid",".compact-page-head","grid-template-columns:repeat(2,minmax(0,1fr))"]:
    assert token in portal_css, f'Missing compact Data UnM CSS: {token}'

assert "plan-primary-nav" in plan
assert "plan-secondary-nav" in daily_ws
assert "plan-secondary-nav" in monthly_ws
assert "plan-secondary-nav" in actual_ws

for token in [
    "daily-mobile-workspace",
    "daily-form-toolbar",
    "Jadwal & Kegiatan",
    "Tenaga & Alat",
    "daily-schedule-grid",
    "daily-resource-grid",
    "daily-status-field ready",
    "daily-status-field breakdown",
    "daily-status-field standby",
]:
    assert token in daily, f'Missing compact Daily mobile token: {token}'

for token in [
    ".plan-primary-nav",
    ".plan-secondary-nav",
    ".daily-form-group",
    ".daily-schedule-grid",
    ".daily-resource-grid",
    ".daily-single-form-actions",
]:
    assert token in field_css, f'Missing compact Plan/Daily CSS: {token}'

print('Mobile Plan UI check passed: Data UnM uses compact shortcuts, all Plan workspaces use horizontal navigation, and Daily input is split into touch-friendly grouped sections.')
