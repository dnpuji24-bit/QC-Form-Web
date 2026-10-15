from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
source=(root/'src'/'qcDailyPlanSource.ts').read_text(encoding='utf-8')

assert "function shiftKey(value:unknown)" in source
assert "rowShift===selectedShift" in source
for token in ["'1':'1'","'shift1':'1'","'2':'2'","'shift2':'2'","'s2':'2'","'2.0':'2'","'shiftii':'2'"]:
    assert token in source, f"Missing shift normalization: {token}"

# Guard against re-introducing exact raw-text comparison.
assert "row.shift===shiftKey" not in source
assert "row.shift===selectedShift" not in source
print("QC Daily Plan Shift 1/2 normalization checks: OK")
