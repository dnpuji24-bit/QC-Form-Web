from pathlib import Path

rules=(Path(__file__).resolve().parents[1]/'firestore.rules').read_text(encoding='utf-8')

for collection in ['master_units','master_shifts','master_foremen']:
    token=f"match /{collection}/"
    assert token in rules, f"Missing Firestore rules for {collection}"

assert rules.count("allow read: if activeUser();") >= 3
assert rules.count("canEditKey('data_master_activity_resources',['owner','asisten'])") >= 3
assert rules.count("allow delete: if activeUser() && role() == 'owner';") >= 3

print("Firestore operational resource rules check passed: resources are readable by active users, editable through granular Master Resource permission (Owner/Asisten fallback), and deletable by Owner.")
