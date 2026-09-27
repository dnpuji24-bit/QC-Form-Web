from pathlib import Path

root=Path(__file__).resolve().parents[1]
resource_panel=(root/'src'/'MasterOperationalResourcePanel.tsx').read_text(encoding='utf-8')
resource_helper=(root/'src'/'masterOperationalResources.ts').read_text(encoding='utf-8')
workspace=(root/'src'/'MasterActivityWorkspace.tsx').read_text(encoding='utf-8')
daily=(root/'src'/'DailyPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
actual=(root/'src'/'ActualPlanWebEntryPanel.tsx').read_text(encoding='utf-8')
spray=(root/'src'/'SprayForm.tsx').read_text(encoding='utf-8')
fert=(root/'src'/'FertilizerForm.tsx').read_text(encoding='utf-8')
manage=(root/'src'/'MasterActivityManagePanel.tsx').read_text(encoding='utf-8')

for token in ["master_units","master_shifts","master_foremen","loadAllOperationalResources"]:
    assert token in resource_helper, f"Missing separate resource master token: {token}"

for token in ["Master Resource Operasional","Master Unit","Master Shift","Master Mandor / Foreman"]:
    assert token in resource_panel, f"Missing resource management UI token: {token}"

assert "Master Resource" in workspace

for token in [
    'list="daily-resource-shifts"',
    'list="daily-resource-foremen"',
    'list="daily-resource-units"',
    "Ketik S untuk Stool Splitter",
]:
    assert token in daily, f"Daily Plan smartsearch missing: {token}"

for token in [
    'list="actual-resource-foremen"',
    'list="actual-resource-units"',
]:
    assert token in actual, f"Actual Plan smartsearch missing: {token}"

for source,name,prefix in [(spray,"Spraying","spray"),(fert,"Fertilizer","fert")]:
    for token in [
        f'list="{prefix}-resource-shifts"',
        f'list="{prefix}-resource-foremen"',
        f'list="{prefix}-resource-units"',
    ]:
        assert token in source, f"QC {name} smartsearch missing: {token}"

for forbidden in ["Default Unit","Default Shift","Default Mandor / Foreman"]:
    assert forbidden not in manage, f"Activity should not own operational resource field: {forbidden}"

print("Operational resource smartsearch check passed: Unit, Shift, and Foreman are separate masters and are reused by Daily, Actual, Spraying QC, and Fertilizer QC.")
