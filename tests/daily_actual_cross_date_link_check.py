from pathlib import Path
root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanListPanel.tsx').read_text(encoding='utf-8')
actual=(root/'src'/'ActualPlanListPanel.tsx').read_text(encoding='utf-8')

for token in [
    "type LinkedActualRef=",
    "findLinkedActuals",
    "splitActualLinks",
    "crossDate",
    "detachCrossDateActuals",
    "dailyLinkStatus:'NOT_FOUND'",
    "detachedFromDailyPlanId",
    "detachedFromDailyDate",
    "detachedReason:'DAILY_DELETED'",
    "link Actual lintas tanggal dilepas",
]:
    assert token in daily, f'Missing Daily cross-date Actual unlink token: {token}'

assert "hasLinkedActual(" not in daily
assert "Ada '+sameDate.length+' Actual Plan pada tanggal Daily yang sama" in daily
assert "data Actual tetap dipertahankan" in daily

for token in [
    "collection(db,'daily_plans'),where('date','==',targetDate)",
    "matches.length===1?matches[0]:null",
    "dailyLinkStatus=target?'LINKED':matches.length>1?'AMBIGUOUS':'NOT_FOUND'",
    "dailyPlanId=target?.dailyPlanId||''",
    "copiedFromDailyPlanId:sourceRow.dailyPlanId",
    "tertaut ke Daily tanggal tujuan",
    "belum memiliki pasangan Daily yang unik",
]:
    assert token in actual, f'Missing Actual target-date relink token: {token}'

assert "Daily Plan link tetap dipertahankan." not in actual
assert "Daily link tetap sama." not in actual
print("Daily delete / Actual cross-date link consistency checks: OK")
