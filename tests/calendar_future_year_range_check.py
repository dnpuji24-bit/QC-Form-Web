from pathlib import Path
root=Path(__file__).resolve().parents[1]
calendar=(root/'src'/'PlanCalendarRecap.tsx').read_text(encoding='utf-8')

assert "year<1900||year>9999" in calendar
assert "jumpToMonth(String(year).padStart(4,'0')+'-'+String(current.getMonth()+1).padStart(2,'0'))" in calendar
assert "monthOptions" not in calendar
assert "todayYear+5" not in calendar
assert "endYear" not in calendar
print("Calendar future-year range check: OK")
