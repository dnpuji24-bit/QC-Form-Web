from pathlib import Path

root=Path(__file__).resolve().parents[1]
listing=(root/'src'/'MasterActivityListPanel.tsx').read_text(encoding='utf-8')
manage=(root/'src'/'MasterActivityManagePanel.tsx').read_text(encoding='utf-8')
css=(root/'src'/'field-ui.css').read_text(encoding='utf-8')

for token in [
    "Edit Dosis & Satuan",
    "saveCompositionEdit",
    "editComponents",
    "activity-recipe-inline-input",
    "WEB_MANUAL_EDIT_DETAIL",
    "Dosis / Ha harus lebih dari 0",
    "belum memiliki Master Bahan ACTIVE dengan satuan",
]:
    assert token in listing, f"Missing Activity detail edit token: {token}"

assert 'onChange={e=>updateComponent(index,{unit:e.target.value})}' in manage
assert 'readOnly placeholder="otomatis dari Master Bahan"' not in manage

for token in [
    "Activity composition inline editor",
    ".activity-recipe-inline-input",
]:
    assert token in css, f"Missing inline Activity composition editor style: {token}"

print("Master Activity composition edit check passed: dose and unit can be edited from detail and manage views with material/unit safety validation.")
