from pathlib import Path

root=Path(__file__).resolve().parents[1]
panel=(root/'src'/'MasterActivityListPanel.tsx').read_text(encoding='utf-8')
workspace=(root/'src'/'MasterActivityWorkspace.tsx').read_text(encoding='utf-8')
styles=(root/'src'/'styles.css').read_text(encoding='utf-8')

assert 'className="master-activity-list"' in panel
assert 'master-activity-titlebar' in panel
assert 'master-activity-table-panel' in panel
assert 'master-activity-table-wrap' in panel
assert 'Daftar ini menunjukkan tepat apa yang akan dibaca Plan' not in panel
assert 'Tabel dibuat ringkas. Klik' not in panel

assert 'master-activity-workspace' in workspace
assert 'master-activity-segmented' in workspace

for token in [
    'Premium compact Master Activity',
    '.master-activity-list>.stats-grid{grid-template-columns:repeat(6',
    '@media(max-width:700px)',
    '.master-activity-list>.stats-grid{grid-template-columns:repeat(3',
    '.master-activity-table-wrap table{min-width:760px',
]:
    assert token in styles, f'Missing compact Master Activity style: {token}'

print('Master Activity compact premium UI check passed.')
