from pathlib import Path

rules=(Path(__file__).resolve().parents[1]/'firestore.rules').read_text(encoding='utf-8')

for collection in ['master_units','master_shifts','master_foremen']:
    token=f"match /{collection}/"
    assert token in rules, f"Missing Firestore rules for {collection}"

for fragment in [
    "allow read: if activeUser();",
    "allow create, update: if activeUser() && canWriteAll();",
    "allow delete: if activeUser() && role() == 'owner';",
]:
    assert rules.count(fragment) >= 3, f"Operational resource permission fragment missing: {fragment}"

print("Firestore operational resource rules check passed: Unit, Shift, and Foreman masters are readable by active users, writable by Owner/Asisten, and deletable by Owner.")
