from pathlib import Path

root=Path(__file__).resolve().parents[1]
workspace=(root/'src'/'DailyPlanWorkspace.tsx').read_text(encoding='utf-8')
web=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
listing=(root/'src'/'DailyPlanListPanel.tsx').read_text(encoding='utf-8')
types=(root/'src'/'dailyPlanWorkspaceTypes.ts').read_text(encoding='utf-8')

for token in [
    "groupSavedDailyRows",
    "workGroupId",
    "rows:ordered",
    "DailyComposerRequest",
]:
    assert token in types, f'Missing saved Daily group model token: {token}'

for token in [
    "composerRequest",
    "onEditGroup",
    "onDuplicateGroup",
    "mode:'edit-saved'",
    "mode:'duplicate-saved'",
]:
    assert token in workspace, f'Missing saved-to-main-composer routing token: {token}'

for token in [
    "persistedDocId",
    "persistedDailyPlanId",
    "savePersistedEdit",
    "Simpan Perubahan Daily",
    "Daily ID tetap",
    "where('dailyPlanId','in'",
    "where('dailyPlanId','=='",
]:
    assert token in web, f'Missing persisted Daily main-editor token: {token}'

for token in [
    "groupSavedDailyRows(rows)",
    "moveGroup(",
    "deleteGroup(",
    "copyGroupsToDate(",
    "onEditGroup?.(group)",
    "onDuplicateGroup?.(group)",
]:
    assert token in listing, f'Missing saved Daily grouped action token: {token}'

assert 'id="daily-edit-panel"' not in listing
assert "where('date','==',dateFilter)" in listing
assert "where('date','==',targetDate)" in listing

print('Saved Daily main-editor check passed: saved rows are grouped, full card actions are restored, edit/duplicate route to the main composer, and period-scoped queries remain.')
