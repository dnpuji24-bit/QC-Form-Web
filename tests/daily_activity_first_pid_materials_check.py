from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
listing=(root/'src'/'DailyPlanListPanel.tsx').read_text(encoding='utf-8')
actions=(root/'src'/'dailyPlanActions.ts').read_text(encoding='utf-8')

for token in [
    "<span>Activity</span>",
    "activityChoices(rows:Monthly[],masters:MasterActivity[]",
    "masters.filter(item=>item.active).map(item=>item.activity)",
    "return searchKey(row.activity||row.description)===activityKey",
    "Kegiatan boleh berbeda selama Activity sama",
    "descriptionSearch",
    "masterActivityId",
    "daily-pid-work-detail",
    "daily-pid-materials",
]:
    assert token in daily, f'Missing Activity-first Daily token: {token}'

assert "BAHAN & DOSIS ACUAN" not in daily
assert "activityDosePreview" not in daily
assert "const description=isMonthly?(selected?.description||row.description" in daily
assert "componentsSnapshot:components" in daily

for token in [
    "group.activity||group.description",
    "daily-saved-pid-task",
    "daily-saved-pid-materials",
]:
    assert token in listing, f'Missing saved Activity-first Daily token: {token}'

for token in [
    "🧾 Kegiatan:",
    "🧪 Bahan & Dosis:",
    "row.materials.map(materialLine)",
    "activity |",
]:
    assert token in actions, f'Missing Activity-first WhatsApp token: {token}'

print("Daily Activity-first / per-paddock kegiatan and material checks: OK")
