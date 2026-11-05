from pathlib import Path
root=Path(__file__).resolve().parents[1]
admin=(root/'src'/'AdminPages.tsx').read_text(encoding='utf-8')
app=(root/'src'/'App.tsx').read_text(encoding='utf-8')
dash=(root/'src'/'OperationalDashboard.tsx').read_text(encoding='utf-8')
assert admin.count("<YinYangRefreshButton") >= 2
assert 'className="qc-refresh-button"' in app
assert 'label="Refresh data"' in dash
print("User Access + Form QC yin-yang refresh checks: OK")
