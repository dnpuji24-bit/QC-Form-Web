from pathlib import Path

root = Path(__file__).resolve().parents[1]
app = (root/'src'/'App.tsx').read_text(encoding='utf-8')
api = (root/'src'/'api.ts').read_text(encoding='utf-8')
admin = (root/'src'/'AdminPages.tsx').read_text(encoding='utf-8')
dash = (root/'src'/'OperationalDashboard.tsx').read_text(encoding='utf-8')
backend = (root/'Code.gs').read_text(encoding='utf-8')
compact = ''.join(app.split())

for token in ["'users'", "'logs'", 'UsersApproval', 'ActivityLogs', 'OperationalDashboard', 'canLogs(user)']:
    assert token in app, f'Missing App integration: {token}'
assert "user.role==='owner'" in compact, 'Owner-only Users navigation missing'

for token in ['users:', 'approveUser:', 'rejectUser:', 'logs:']:
    assert token in api, f'Missing API wrapper: {token}'
for token in ['Users & Approval', 'Menunggu Persetujuan', 'Activity Logs', 'AUDIT TRAIL']:
    assert token in admin, f'Missing admin UI: {token}'
for token in ['Dashboard QC', 'Luas yang Sudah Dikerjakan', 'Spray area', 'Fertilizer area', 'Pupuk tercatat', 'Total area dikerjakan', 'worked-paddocks', 'onOpenRecords']:
    assert token in dash, f'Missing dashboard metric or navigation: {token}'
assert 'Total luas pada Plan' not in dash
assert "requireRole_(session,['owner'])" in backend
assert "requireRole_(session,['owner','manager','admin','asisten'])" in backend
print('Admin, logs, and operational dashboard React check: OK')
