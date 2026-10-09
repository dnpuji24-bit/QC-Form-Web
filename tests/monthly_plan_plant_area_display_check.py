from pathlib import Path

source=(Path(__file__).resolve().parents[1]/'src'/'MonthlyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')

for token in [
    "plantAreaHa:number",
    "function plantAreaFromData",
    "varietyAreaTotalHa",
    "plantProgress",
    "<span>Plant Area Total <strong>{planHa(info.paddock.plantAreaHa)}</strong></span>",
    "plantAreaHa:p.plantAreaHa",
]:
    assert token in source, f"Missing Monthly Plant Area token: {token}"

assert "<span>Area Paddock <strong>{planHa(info.paddock.areaPaddockHa)}</strong></span>" not in source

print("Monthly paddock info check passed: Plant Area Total is displayed with snapshot persistence.")
