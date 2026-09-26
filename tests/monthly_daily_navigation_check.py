from pathlib import Path

root=Path(__file__).resolve().parents[1]
monthly=(root/'src'/'MonthlyPlanListPanel.tsx').read_text(encoding='utf-8')
monthly_workspace=(root/'src'/'MonthlyPlanWorkspace.tsx').read_text(encoding='utf-8')
plan_workspace=(root/'src'/'PlanWorkspace.tsx').read_text(encoding='utf-8')
daily_workspace=(root/'src'/'DailyPlanWorkspace.tsx').read_text(encoding='utf-8')
daily_list=(root/'src'/'DailyPlanListPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "Cari Monthly Plan / Paddock",
    "Contoh: A007 / JAGF-1-A-007 / Top Dressing",
    "searchKey(value:unknown)",
    "replace(/[^a-z0-9]/g,'')",
    "searching&&compact",
    "DailyRef={id:string;dailyPlanId:string",
    "dailyByMonthlyId",
    "Daily Plan terkait",
    "Buka Daily →",
    "onOpenDailyPlan?.({date,monthlyPlanLineId:row.planLineId,pid:row.pid})",
]:
    assert token in monthly, f'Missing Monthly search/Daily-link token: {token}'

assert "onOpenDailyPlan" in monthly_workspace
assert "dailyJump" in plan_workspace
assert "setDailyJump(request);setTab('daily')" in plan_workspace
assert "jumpRequest" in daily_workspace
assert "setSelectedDate(jumpRequest.date)" in daily_workspace
assert "focusMonthlyPlanLineId" in daily_list
assert "Dibuka dari Monthly Plan" in daily_list
assert "row.monthlyPlanLineId===focusMonthlyPlanLineId" in daily_list

for token in [
    ".monthly-quick-search",
    ".monthly-linked-daily",
    ".monthly-daily-link-button",
    ".daily-monthly-focus",
    ".daily-linked-pid-match",
]:
    assert token in css, f'Missing Monthly search/Daily-link style: {token}'

print('Monthly search and Daily navigation check passed: A007-style normalized search spans the active month, linked Daily dates are visible, and each date opens a focused Daily Plan.')
