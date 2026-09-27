from pathlib import Path

root=Path(__file__).resolve().parents[1]
app=(root/'src'/'App.tsx').read_text(encoding='utf-8')
portal=(root/'src'/'PortalRouter.tsx').read_text(encoding='utf-8')
admin=(root/'src'/'AdminPages.tsx').read_text(encoding='utf-8')
access=(root/'src'/'accessControl.ts').read_text(encoding='utf-8')
hydrate=(root/'src'/'userAccess.ts').read_text(encoding='utf-8')
rules=(root/'firestore.rules').read_text(encoding='utf-8')
backend=(root/'Code.gs').read_text(encoding='utf-8')
registration=(root/'src'/'registrationRoleIntent.ts').read_text(encoding='utf-8')

# Users administration moved out of QC navigation and into the Operational Portal home.
assert "UsersApproval" not in app
for token in ["Users & Access","mode==='users'","<UsersApproval","canUsers"]:
    assert token in portal, f"Missing portal Users integration: {token}"

# Registration offers the same full role catalog used by administration.
for role in ['owner','manager','admin','asisten','mandor_spraying','mandor_fertilizer','pengunjung']:
    assert f'<option value="{role}">' in app, f"Missing registration role: {role}"
assert "['owner','manager','admin'].indexOf(requested)>=0" not in backend
assert "registration_requests" in registration
assert "saveRegistrationRoleIntent" in app
assert "match /registration_requests/{uid}" in rules
assert "requestedRole" in admin

# Owner can assign menu/submenu access modes.
for token in ['PERMISSION_CATALOG','Tidak Akses','Hanya Lihat','Simpan Hak Akses','user_access']:
    assert token in admin or token in access, f"Missing granular access UI/model token: {token}"
for mode in ["'none'","'view'","'edit'"]:
    assert mode in access
for key in ['qc_spraying','qc_fertilizer','qc_records','data_plan_monthly','data_plan_daily','data_plan_actual','data_master_paddock_import','data_master_activity_manage','data_company']:
    assert key in access, f"Missing permission key: {key}"

# Dedicated Firestore override survives Apps Script profile refreshes and is hydrated into the session.
assert "match /user_access/{uid}" in rules
assert "accessOverridePath" in rules
assert "user_access" in hydrate
assert "hydrateUserAccess" in app
assert "hydrateUserAccess" in portal

print("Portal Users + granular role/access check passed.")
