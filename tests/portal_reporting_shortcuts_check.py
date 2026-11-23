from pathlib import Path

root=Path(__file__).resolve().parents[1]
portal=(root/'src'/'PortalRouter.tsx').read_text(encoding='utf-8')
workspace=(root/'src'/'PlanWorkspace.tsx').read_text(encoding='utf-8')
css=(root/'src'/'portal.css').read_text(encoding='utf-8')

# First-class reporting destinations in the Operational Portal.
for token in [
    "'summary'|'calendar'",
    "const canSummary=Boolean(user&&canViewAccess(user,'data_plan_summary'))",
    "const canCalendar=Boolean(user&&",
    "if(next==='summary'&&!canSummary)return",
    "if(next==='calendar'&&!canCalendar)return",
    "mode==='summary'&&canSummary",
    "mode==='calendar'&&canCalendar",
    "choose('summary')",
    "choose('calendar')",
    '<PlanSummaryDashboard/>',
    '<PlanCalendarRecap/>',
    "portal-summary-card",
    "portal-calendar-card",
    "onClick={()=>choose('chooser')}>← Kembali",
    "<PlanOfflineBanner/>",
]:
    assert token in portal, f'Missing safe main portal reporting navigation: {token}'

# Reporting routes must not remain in Plan; no duplicate tab, data model untouched.
assert "type Tab='monthly'|'daily'|'actual'|'reconciliation'" in workspace
for legacy in [
    "navigateTab('summary')", "navigateTab('calendar')",
    "tab==='summary'", "tab==='calendar'",
    ">Summary</button>", ">Calendar Rekap</button>",
]:
    assert legacy not in workspace, f'Duplicate reporting tab: {legacy}'

for kept in ['Monthly Plan','Daily Plan','Actual Plan','Rekonsiliasi']:
    assert kept in workspace, f'Plan input menu missing: {kept}'

assert '.portal-report-content{' in css
assert '.chooser-layer .portal-summary-card' in css
assert '.chooser-layer .portal-calendar-card' in css

print('Main portal Summary / Calendar navigation and access regression: OK')
