from pathlib import Path

root = Path(__file__).resolve().parents[1]
app = (root/'src'/'App.tsx').read_text(encoding='utf-8')
portal = (root/'src'/'PortalRouter.tsx').read_text(encoding='utf-8')
api = (root/'src'/'api.ts').read_text(encoding='utf-8')
admin = (root/'src'/'AdminPages.tsx').read_text(encoding='utf-8')
dash = (root/'src'/'OperationalDashboard.tsx').read_text(encoding='utf-8')
backend = (root/'Code.gs').read_text(encoding='utf-8')

for token in ["'logs'", 'ActivityLogs', 'OperationalDashboard', 'canLogs(user)', 'canViewAccess']:
    assert token in app, f'Missing QC App integration: {token}'
assert "UsersApproval" not in app, 'Users administration must live on Operational Portal, not QC tabs.'

for token in ["'users'", 'UsersApproval', 'Users & Access', 'Pengguna & Hak Akses', "user?.role==='owner'"]:
    assert token in portal, f'Missing Operational Portal Users integration: {token}'

for token in ['users:', 'approveUser:', 'rejectUser:', 'updateUserRole:', 'updateRolePermissions:', 'logs:']:
    assert token in api, f'Missing API wrapper: {token}'
for token in ['Users & Approval', 'Menunggu Persetujuan', 'Activity Logs', 'AUDIT TRAIL', 'HAK AKSES TERPUSAT', 'Simpan Hak Akses Role']:
    assert token in admin, f'Missing admin/access UI: {token}'
for token in ['Dashboard QC', 'Luas yang Sudah Dikerjakan', 'Spray area', 'Fertilizer area', 'Pupuk tercatat', 'Total area dikerjakan', 'worked-paddocks', 'onOpenRecords']:
    assert token in dash, f'Missing dashboard metric or navigation: {token}'
assert 'Total luas pada Plan' not in dash
assert "if (action === 'users') { requireRole_(session,['owner'])" in backend
assert "if (action === 'updateRolePermissions') { requireRole_(session,['owner'])" in backend
assert "requirePermission_(session,'qc_logs',false)" in backend
print('Portal Users, role-based access, logs, and operational dashboard React check: OK')
