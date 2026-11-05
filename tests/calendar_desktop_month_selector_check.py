from pathlib import Path
root=Path(__file__).resolve().parents[1]
calendar=(root/'src'/'PlanCalendarRecap.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

assert "const cursorYear=parseDate(cursor).getFullYear()" in calendar
assert "const cursorMonthNumber=String(cursorMonth+1).padStart(2,'0')" in calendar
assert '<select value={cursorMonthNumber}' in calendar
assert "MONTH_NAMES.map((name,index)=>" in calendar
assert "function commitCalendarYear()" in calendar
assert 'className="calendar-year-input"' in calendar
assert 'type="number"' in calendar
assert 'min="1900"' in calendar
assert 'max="9999"' in calendar
assert "onBlur={commitCalendarYear}" in calendar
assert "onChange={e=>setYearDraft(e.target.value)}" in calendar
assert "monthOptions" not in calendar
assert ".calendar-month-select-wrap>select{" in css
assert ".calendar-year-input{" in css
print("Calendar desktop month/year selector check: OK")
