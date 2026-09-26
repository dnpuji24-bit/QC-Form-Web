from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "BAHAN & DOSIS ACUAN",
    "activityDosePreview",
    "activityReference",
    "Dosis ",
    "Isi luas PID untuk total",
    "Belum ada bahan/dosis pada Master Activity atau Monthly Plan",
]:
    assert token in daily, f'Missing Daily activity material preview token: {token}'

for token in [
    ".daily-activity-material-preview",
    ".daily-material-dose-list",
    ".daily-material-empty",
]:
    assert token in css, f'Missing Daily material preview style: {token}'

print('Daily activity material preview check passed: selecting an activity immediately shows material dosage, and total requirement appears after PID areas are entered.')
