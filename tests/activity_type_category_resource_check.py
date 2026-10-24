from pathlib import Path
root=Path(__file__).resolve().parents[1]
cls=(root/'src/activityClassifications.ts').read_text(encoding='utf-8')
resources=(root/'src/MasterOperationalResourcePanel.tsx').read_text(encoding='utf-8')
helper=(root/'src/masterOperationalResources.ts').read_text(encoding='utf-8')
manage=(root/'src/MasterActivityManagePanel.tsx').read_text(encoding='utf-8')
importer=(root/'src/MasterActivityImportPanel.tsx').read_text(encoding='utf-8')
rules=(root/'firestore.rules').read_text(encoding='utf-8')

for token in [
    "activity_type:'master_activity_types'",
    "activity_category:'master_activity_categories'",
    "activity_type:['SPRAY','FERTILIZER','OTHERS']",
    "'OTHER'",
    'export function classificationRows',
    'export async function loadActivityClassifications',
    'export function activityRequiresRecipe',
]:
    assert token in cls, f'Activity classification resource missing: {token}'
for token in [
    "classification:{label:'Klasifikasi Activity'",
    "activity_type:{title:'Activity Type'",
    "activity_category:{title:'Activity Category'",
    "classificationRows(kind,snap.docs.map",
    "classificationName(value)",
    "classificationId(name)",
    "Type/Category tidak boleh dihapus",
]:
    assert token in resources, f'Master Resource classification missing: {token}'
assert "'activity_type'" in helper
assert "'activity_category'" in helper
for token in [
    "loadActivityClassifications('activity_type')",
    "loadActivityClassifications('activity_category')",
    'const typeOptions=useMemo',
    "activityRequiresRecipe(type)",
    "!activityRequiresRecipe(row.type)",
    "Tipe OTHERS atau non-QC lain dapat ACTIVE tanpa komposisi.",
    'typeOptions.map(option=><option',
    'categoryOptions.map(option=><option',
]:
    assert token in manage, f'Master Activity dynamic options missing: {token}'
assert '<option value="SPRAY">SPRAY</option><option value="FERTILIZER">FERTILIZER</option></select>' not in manage
for token in [
    "if(key==='others'||key==='other')return'OTHERS'",
    "activityRequiresRecipe(base.type)",
    "['SPRAY','FERTILIZER','OTHERS']",
]:
    assert token in importer, f'Excel import OTHERS support missing: {token}'
for name in ['master_activity_types','master_activity_categories']:
    assert f'match /{name}/' in rules
    block=rules[rules.index(f'match /{name}/'):]
    assert "canEditKey('data_master_activity_resources',['owner','asisten'])" in block[:240]
    assert "allow delete: if false;" in block[:340]

print('Activity Type/Category Firestore master, OTHERS no-recipe and Excel import: OK')
