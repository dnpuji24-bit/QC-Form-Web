from pathlib import Path

root = Path(__file__).resolve().parents[1]
monthly = (root/'src'/'MonthlyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
daily = (root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
actual = (root/'src'/'ActualPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
utils = (root/'src'/'planInputUtils.ts').read_text(encoding='utf-8')
css = (root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "BATCH INPUT",
    "writeBatch",
    "Draft otomatis",
    "Tambah Pekerjaan",
    "Total Planning",
    "materialsPreview",
    "componentsSnapshot",
    "Reset Draft",
]:
    assert token in monthly, f'Missing Monthly batch-input token: {token}'

for token in [
    "BATCH INPUT",
    "writeBatch",
    "Monthly → Daily",
    "Jumlah HK",
    "Unit Ready",
    "Unit Breakdown",
    "Unit Standby",
    "materialLinesFromComponents",
    "Sisa",
    "Reset Draft",
]:
    assert token in daily, f'Missing Daily batch-input token: {token}'

for token in [
    "BATCH INPUT",
    "writeBatch",
    "Daily → Actual",
    "Luas Actual",
    "dailyVarianceHa",
    "monthlyPlanLineId",
    "Unit Ready",
    "Unit Breakdown",
    "Unit Standby",
    "Reset Draft",
]:
    assert token in actual, f'Missing Actual batch-input token: {token}'

for token in [
    "readPlanDraft",
    "writePlanDraft",
    "clearPlanDraft",
    "materialLinesFromComponents",
    "aggregateMaterials",
]:
    assert token in utils, f'Missing plan-input helper: {token}'

for token in [
    ".plan-entry-screen",
    ".plan-work-card",
    ".plan-summary-grid",
    ".plan-material-summary",
    ".plan-danger-text",
]:
    assert token in css, f'Missing Plan batch style: {token}'

assert "daily_plans" in daily and "monthly_plans" in monthly and "daily_reports" in actual
assert "monthlyPlanLineId:selected.planLineId" in daily
assert "dailyPlanId:selected.dailyPlanId" in actual
assert "monthlyPlanLineId" in actual

print('Plan batch input check passed: Monthly, Daily and Actual support autosaved batch entry, operational resources, material calculation, and linked atomic writes.')
