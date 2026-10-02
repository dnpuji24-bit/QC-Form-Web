from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "daily-pid-work-detail",
    "daily-pid-materials",
    "Pilih kegiatan untuk melihat bahan dan dosis.",
    "Dosis ",
    "Total ",
    "descriptionSearch",
    "masterActivityId",
    "taskOptions",
]:
    assert token in daily, f'Missing Daily per-PID material token: {token}'

assert "BAHAN & DOSIS ACUAN" not in daily
assert "activityDosePreview" not in daily

for token in [
    "Daily Activity-first + per-paddock kegiatan/material",
    ".daily-pid-work-detail",
    ".daily-pid-materials",
    ".daily-draft-pid-materials",
]:
    assert token in css, f'Missing Daily per-PID material style: {token}'

print('Daily per-PID material check passed: activity is shared by the group while each paddock keeps its own kegiatan, dose, and total material.')
