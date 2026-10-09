from pathlib import Path

root=Path(__file__).resolve().parents[1]
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

# Per-PID Kegiatan/material preview remains available for MONTHLY plans.
for token in [
    "daily-pid-work-detail",
    "daily-pid-materials",
    "Pilih PID / Monthly Plan untuk melihat bahan dan dosis.",
    "Dosis ",
    "Total ",
    "descriptionSearch",
    "masterActivityId",
    "taskOptions",
    "const materials=work.sourceType==='MONTHLY'?materialLinesFromComponents(components,area):[]",
]:
    assert token in daily, f'Missing Daily MONTHLY per-PID material token: {token}'

# ADHOC and SUPPORT intentionally do not require a per-PID Kegiatan/material selection.
for token in [
    "Kegiatan & bahan tidak diperlukan untuk ADHOC / SUPPORT.",
    "Tidak perlu memilih Kegiatan atau memasukkan bahan untuk sumber",
    "materials:isMonthly?row.materials:[]",
]:
    assert token in daily, f'Missing ADHOC/SUPPORT no-material behavior: {token}'

assert "BAHAN & DOSIS ACUAN" not in daily
assert "activityDosePreview" not in daily

for token in [
    "Daily Activity-first + per-paddock kegiatan/material",
    ".daily-pid-work-detail",
    ".daily-pid-materials",
    ".daily-draft-pid-materials",
]:
    assert token in css, f'Missing Daily per-PID material style: {token}'

print('Daily material check passed: MONTHLY keeps per-PID material detail while ADHOC/SUPPORT use Activity without Kegiatan/material selection.')
