from pathlib import Path

source=(Path(__file__).resolve().parents[1]/'src'/'MasterActivityListPanel.tsx').read_text(encoding='utf-8')

assert "if(status==='ACTIVE'&&!item.active)return false" in source
assert "if(status==='INACTIVE'&&item.active)return false" in source
assert "status==='ACTIVE'?item.active:!item.active" not in source

print("Master Activity status filter check passed: ACTIVE shows only active rows and INACTIVE shows only inactive rows.")
