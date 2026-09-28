from pathlib import Path
root=Path(__file__).resolve().parents[1]
monthly=(root/'src'/'MonthlyPlanListPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "sourceCatalog",
    "sourceSearchLoaded",
    "sourceSearchBusy",
    "getDocs(collection(firestoreDb,'monthly_plans'))",
    "const sourceMatches=useMemo",
    "effectiveRows=searchingSource?sourceMatches:rows",
    "effectiveDaily=searchingSource?searchDaily:daily",
    "const filtered=useMemo(()=>searchingSource?viewRows:",
    "Search seluruh sumber Firestore",
    "filter periode/week/company/farm/status diabaikan",
    "searchingSource?row.monthKey+' · ':''",
]:
    assert token in monthly, f"Missing source-wide Monthly search token: {token}"

assert "Saat mencari, semua week pada bulan aktif ikut diperiksa." not in monthly
assert "Monthly source-wide search" in css
assert ".monthly-quick-search.source-search-active" in css
print("Monthly source-wide search checks: OK")
