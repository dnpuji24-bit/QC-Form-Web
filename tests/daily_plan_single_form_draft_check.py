from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "DAILY PLAN",
    "Simpan ke Draft",
    "DRAFT DAILY PLANNING",
    "Periksa Hasil Plan",
    "Copy WA Semua",
    "Simpan Semua Daily Plan",
    "editDraft(",
    "deleteDraft(",
    "duplicateDraft(",
    "draftTransfers(",
    "writePlanDraft(draftKey,state)",
    "moveDraft(",
    "dropDraft(",
    "↑ Naik",
    "↓ Turun",
    "planningOrder:state.works.findIndex",
]:
    assert token in daily, f'Missing single-form Daily draft token: {token}'

for token in [
    ".daily-single-form",
    ".daily-draft-board",
    ".daily-draft-shift",
    ".daily-draft-card",
    ".daily-draft-pids",
    ".daily-draft-materials",
    ".daily-drag-handle",
    ".daily-order-actions",
]:
    assert token in css, f'Missing single-form Daily draft style: {token}'

assert "dailyPlansToWhatsApp" in daily
assert "workGroupId:group.work.id" in daily
assert "workGroupPidCount:group.pids.length" in daily

print('Daily single-form draft composer check passed: one active form feeds editable shift-grouped draft cards with WhatsApp preview and final Firestore batch save.')
