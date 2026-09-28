from pathlib import Path
root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')

for token in [
    "function monthlyActivityCompatible",
    "function monthlyPidMatches",
    "const compatibleMatches=matches.filter",
    "const[pidMonthly,setPidMonthly]",
    "loadedPidKeysRef",
    "async function loadMonthlyPid(input:string)",
    "where('pid','==',pid)",
    "Pencarian PID Monthly lintas week/bulan gagal.",
    "void loadMonthlyPid(value)",
    "pilihan aktif dengan Activity yang sama",
    "Mencari PID lintas week/bulan",
    "Activity yang berbeda dari Activity pada form.",
]:
    assert token in daily, f"Missing Daily PID cross-period token: {token}"

assert "[...monthly,...activityMonthly,...pidMonthly]" in daily
print("Daily Plan PID cross-week/month Monthly lookup checks: OK")
