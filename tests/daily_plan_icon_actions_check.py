from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
listing=(root/'src'/'DailyPlanListPanel.tsx').read_text(encoding='utf-8')
icons=(root/'src'/'DailyPlanActionIcon.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "DailyActionIcon",
    'aria-label="Naik"',
    'aria-label="Turun"',
    'aria-label="Copy ke WhatsApp"',
    'aria-label="Duplikat"',
    'aria-label="Edit"',
    'aria-label="Hapus"',
]:
    assert token in daily, f'Missing draft icon action token: {token}'

for token in [
    "DailyActionIcon",
    'aria-label="Naik"',
    'aria-label="Turun"',
    'aria-label="Copy WA"',
    'aria-label="Salin ke tanggal"',
    'aria-label="Duplikat"',
    'aria-label="Edit"',
    'aria-label="Hapus"',
]:
    assert token in listing, f'Missing saved Daily icon action token: {token}'

for token in [
    "'up'|'down'|'wa'|'copy'|'edit'|'trash'|'calendar'",
    "name==='calendar'",
    "name==='trash'",
]:
    assert token in icons, f'Missing shared Daily icon definition: {token}'

for token in [
    ".daily-icon-action",
    ".daily-icon-action.wa",
    ".daily-icon-action.danger",
    ".daily-saved-group-actions",
]:
    assert token in css, f'Missing Daily icon-grid style: {token}'

print('Daily icon action check passed: draft and saved cards share accessible compact icon actions, including copy-date and trash.')
