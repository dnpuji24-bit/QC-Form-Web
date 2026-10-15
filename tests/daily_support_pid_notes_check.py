from pathlib import Path

root=Path(__file__).resolve().parents[1]
entry=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
types=(root/'src'/'dailyPlanWorkspaceTypes.ts').read_text(encoding='utf-8')
saved=(root/'src'/'DailyPlanListPanel.tsx').read_text(encoding='utf-8')
wa=(root/'src'/'dailyPlanActions.ts').read_text(encoding='utf-8')
styles=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

assert "pidNotes:string" in entry
assert "state.active.sourceType==='SUPPORT'" in entry
assert "Keterangan PID" in entry
assert "Opsional: unit / perlakuan khusus" in entry
assert entry.count("pidNotes:row.pid.pidNotes") >= 2
assert "pidNotes:row.pidNotes||''" in entry
assert 'row.pid.pidNotes&&<small className="daily-draft-pid-note"' in entry

assert "pidNotes:string" in types
assert "pidNotes:text(data.pidNotes)" in saved
assert 'row.pidNotes&&<small className="daily-saved-pid-note"' in saved
assert "pidNotes:row.pidNotes" in saved

assert "pidNotes?:string" in wa
assert "↳ Ket:" in wa

assert ".daily-pid-note" in styles
assert ".daily-pid-row:has(.daily-pid-note)" in styles

print("Support Daily Plan per-PID optional notes check passed.")
