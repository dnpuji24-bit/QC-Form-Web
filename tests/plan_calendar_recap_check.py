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

print("Calendar Rekap Day/Week/Month checks: OK")
