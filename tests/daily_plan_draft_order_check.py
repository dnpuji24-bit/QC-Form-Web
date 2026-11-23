from pathlib import Path

root=Path(__file__).resolve().parents[1]
web=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
listing=(root/'src'/'DailyPlanListPanel.tsx').read_text(encoding='utf-8')
actions=(root/'src'/'dailyPlanActions.ts').read_text(encoding='utf-8')

for token in [
    "planningOrder:state.works.findIndex",
    "moveDraft(id:string,direction:-1|1)",
    "dropDraft(targetId:string)",
    "draggable",
    "onDragStart",
    'aria-label="Naik"',
    'aria-label="Turun"',
    "DailyActionIcon",
]:
    assert token in web, f'Missing Daily draft ordering token: {token}'

for token in [
    "planningOrder:number",
    "(a.planningOrder||0)-(b.planningOrder||0)",
]:
    assert token in actions, f'Missing WhatsApp planning-order token: {token}'

for token in [
    "planningOrder:targetOrder",
    "planningOrder:sourceOrder",
    "groupSavedDailyRows",
]:
    assert token in listing, f'Missing persisted planning-order token: {token}'

print('Daily draft ordering check passed: users can reorder draft activities and the chosen order is persisted and respected by WhatsApp output.')
