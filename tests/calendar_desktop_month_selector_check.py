from pathlib import Path
root=Path(__file__).resolve().parents[1]
calendar=(root/'src'/'PlanCalendarRecap.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

assert "const monthOptions=useMemo" in calendar
assert '<select value={cursorMonthValue}' in calendar
assert "monthOptions.map(option=>" in calendar
assert "onChange={e=>jumpToMonth(e.target.value)}" in calendar
assert 'type="month"' not in calendar
assert ".calendar-month-picker>select{" in css
assert "cursor:pointer" in css
assert "appearance:none" in css
assert ".calendar-month-picker>input{" not in css
print("Calendar desktop month selector check: OK")
