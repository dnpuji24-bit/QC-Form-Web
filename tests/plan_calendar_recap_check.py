from pathlib import Path
root=Path(__file__).resolve().parents[1]
workspace=(root/'src'/'PlanWorkspace.tsx').read_text(encoding='utf-8')
calendar=(root/'src'/'PlanCalendarRecap.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "import PlanCalendarRecap from './PlanCalendarRecap'",
    "'calendar'",
    ">Calendar Rekap</button>",
    "<PlanCalendarRecap/>",
]:
    assert token in workspace, f"Missing PlanWorkspace Calendar Rekap token: {token}"

for token in [
    "type ViewMode='day'|'week'|'month'",
    "collection(firestoreDb,'daily_plans')",
    "collection(firestoreDb,'daily_reports')",
    "where('date','>=',range.start)",
    "where('date','<=',range.end)",
    "Plan & Actual Calendar",
    ">Day</button>",
    ">Week</button>",
    ">Month</button>",
    "calendar-day-table",
    "calendar-week-grid",
    "calendar-month-grid",
    "openDay(date)",
]:
    assert token in calendar, f"Missing Calendar Rekap token: {token}"

for token in [
    "Calendar Rekap: Daily / Weekly / Monthly",
    ".calendar-recap-layout",
    ".calendar-day-summary",
    ".calendar-week-grid",
    ".calendar-month-grid",
]:
    assert token in css, f"Missing Calendar Rekap CSS token: {token}"


assert "return{start:monthStart(cursor),end:monthEnd(cursor)}" in calendar
assert "const monthDates=useMemo" in calendar
assert "const monthFirstColumn=" in calendar
assert "mode!=='month'&&<aside" in calendar
assert "month-mode" in calendar
assert "gridDates.map" not in calendar
assert "style={index===0?{gridColumnStart:monthFirstColumn}:undefined}" in calendar
assert "calendar-month-summary" in calendar
assert ".calendar-recap-layout.month-mode{grid-template-columns:minmax(0,1fr)}" in css
assert "grid-auto-rows:minmax(132px,1fr)" in css


assert "import { YinYangIcon } from './YinYangRefreshButton'" in calendar
assert "function MonthChevronIcon" in calendar
assert "function jumpToMonth(value:string)" in calendar
assert "const cursorYear=parseDate(cursor).getFullYear()" in calendar
assert "const cursorMonthNumber=String(cursorMonth+1).padStart(2,'0')" in calendar
assert 'className="calendar-month-picker"' in calendar
assert 'select value={cursorMonthNumber}' in calendar
assert "MONTH_NAMES.map((name,index)=>" in calendar
assert "onChange={e=>jumpToMonth(String(cursorYear)+'-'+e.target.value)}" in calendar
assert 'className="calendar-year-input"' in calendar
assert "function commitCalendarYear()" in calendar
assert 'max="9999"' in calendar
assert 'type="month"' not in calendar
assert 'className="calendar-refresh-btn"' in calendar
assert "YinYangIcon spinning={busy}" in calendar
assert "Calendar Rekap premium navigation + month picker" in css
assert ".calendar-month-picker{" in css
assert ".calendar-month-select-wrap>select{" in css
assert ".calendar-year-input{" in css
assert "appearance:none" in css
assert ".yin-yang-icon.spinning{" in css
assert "@keyframes calendar-yinyang-spin" in css

print("Calendar Rekap Day/Week/Month checks: OK")
