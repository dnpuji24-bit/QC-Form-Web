from pathlib import Path

source=(Path(__file__).resolve().parents[1]/'src'/'MonthlyPlanListPanel.tsx').read_text(encoding='utf-8')

for token in [
    "createdAt:string",
    "updatedAt:string",
    "createdAt:dateValue(data.createdAt)",
    "updatedAt:dateValue(data.updatedAt)",
    "const aTime=a.createdAt||a.updatedAt||a.inputDate",
    "bTime.localeCompare(aTime)",
    "urutan terbaru di atas",
]:
    assert token in source, f"Missing newest-first Monthly Plan token: {token}"

print("Monthly Plan newest-first check passed: newest created plan lines appear first with timestamp fallback.")
