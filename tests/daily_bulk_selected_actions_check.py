from pathlib import Path
root=Path(__file__).resolve().parents[1]
listing=(root/'src'/'DailyPlanListPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "deleteSelectedGroups",
    "moveSelectedGroups",
    "groupsWithLinkedActual",
    "Pindahkan Dipilih",
    "Hapus Dipilih",
    "Pindah tanggal",
    "Shift tujuan",
    "Tetap seperti asal",
    "movedFromDailyPlanId",
    "movedFromDate",
    "where('date','==',targetDate)",
    "batch.delete(doc(db,'daily_plans',op.source.id))",
]:
    assert token in listing, f'Missing bulk selected Daily action token: {token}'

assert "Tidak dapat menghapus." in listing
assert "Tidak dapat memindahkan." in listing
assert "Actual Plan terkait" in listing
assert "targetDate===sourceDate" in listing
assert "prefix='DP-'+targetDate.replaceAll('-','')+'-'" in listing

for token in [
    "Bulk selected Daily Plan move/delete actions",
    ".daily-bulk-selected-actions",
    ".daily-bulk-move-button",
    ".daily-bulk-delete-button",
]:
    assert token in css, f'Missing bulk selected Daily style: {token}'

print("Daily bulk selected move/delete checks: OK")
