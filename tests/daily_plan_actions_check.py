from pathlib import Path

root=Path(__file__).resolve().parents[1]
web=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
listing=(root/'src'/'DailyPlanListPanel.tsx').read_text(encoding='utf-8')
actions=(root/'src'/'dailyPlanActions.ts').read_text(encoding='utf-8')
actual=(root/'src'/'ActualPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
plan=(root/'src'/'PlanWorkspace.tsx').read_text(encoding='utf-8')

for token in [
    "Smart Search Monthly",
    "A-007 / pre / top dressing",
    "sourceType:'MONTHLY'",
    "ADHOC",
    "SUPPORT",
    "Nama Kegiatan",
    "Bahan & dosis yang digunakan",
]:
    assert token in web, f'Missing Daily smart/adhoc token: {token}'

for token in [
    "Copy to Actual",
    "Copy to WA",
    "Copy to Date",
    "Pilih Semua Filter",
    "copiedFromDailyPlanId",
    "dailyPlansToWhatsApp",
    "Bahan & Dosis",
]:
    assert token in listing, f'Missing Daily bulk action token: {token}'

for token in [
    "*DAILY PLANNING*",
    "📅 *Tanggal:*",
    "🧪 Bahan:",
    "📊 *Total:*",
]:
    assert token in actions, f'Missing WhatsApp format token: {token}'

assert "Plan ID" not in actions
assert "dailyPlanId" not in actions.split("export function dailyPlansToWhatsApp",1)[1]
assert "prefillDailyPlanIds" in actual
assert "onCopyToActual" in plan

print('Daily Plan action check passed: smart Monthly search, ADHOC input, material review, WhatsApp copy without Plan IDs, Copy to Actual and Copy to Date are wired.')
