from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "type DraftActionIconName='up'|'down'|'wa'|'copy'|'edit'|'trash'",
    'aria-label="Naik"',
    'aria-label="Turun"',
    'aria-label="Copy ke WhatsApp"',
    'aria-label="Duplikat"',
    'aria-label="Edit"',
    'aria-label="Hapus"',
    'name="up"',
    'name="down"',
    'name="wa"',
    'name="copy"',
    'name="edit"',
    'name="trash"',
]:
    assert token in daily, f'Missing icon-only Daily action token: {token}'

for token in [
    ".daily-icon-action",
    ".daily-icon-action.wa",
    ".daily-icon-action.danger",
    "grid-template-columns:repeat(3,36px)",
    "grid-template-columns:repeat(3,34px)",
]:
    assert token in css, f'Missing 3x2 Daily icon-grid style: {token}'

for old in [">↑ Naik<",">↓ Turun<",">WA<",">Duplikat<",">Edit<",">Hapus<"]:
    assert old not in daily, f'Legacy large action text still present: {old}'

print('Daily draft icon action check passed: six actions render as accessible 3x2 icon-only controls beside the activity title.')
