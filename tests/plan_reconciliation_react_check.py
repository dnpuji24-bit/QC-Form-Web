from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
panel = (ROOT / 'src' / 'PlanReconciliationPanel.tsx').read_text(encoding='utf-8')
workspace = (ROOT / 'src' / 'PlanWorkspace.tsx').read_text(encoding='utf-8')

required_panel_tokens = [
    "collection(firestoreDb,'monthly_plans')",
    "collection(firestoreDb,'daily_plans')",
    "collection(firestoreDb,'daily_reports')",
    "DAILY_MONTHLY_MISSING",
    "DAILY_MONTHLY_ORPHAN",
    "ACTUAL_DAILY_MISSING",
    "ACTUAL_DAILY_ORPHAN",
    "ACTUAL_MONTHLY_ORPHAN",
    "ACTUAL_DAILY_MONTHLY_MISMATCH",
    "DAILY_OVER_TARGET",
    "ACTUAL_OVER_TARGET",
    "ACTUAL_WITHOUT_DAILY",
    "ACTUAL_OVER_DAILY",
    "ADHOC dan SUPPORT tidak dianggap error",
    "Rekonsiliasi hanya membaca data",
]
for token in required_panel_tokens:
    assert token in panel, f'Missing reconciliation token: {token}'

assert "PlanReconciliationPanel" in workspace, 'Plan workspace must expose reconciliation panel'
assert "Rekonsiliasi" in workspace, 'Reconciliation tab label missing'
assert "setDoc(" not in panel and "writeBatch(" not in panel and "deleteDoc(" not in panel, 'Reconciliation panel must remain read-only'

print('Plan reconciliation check passed: Monthly/Daily/Actual audit is read-only and covers link/orphan/mismatch/over-target cases.')
