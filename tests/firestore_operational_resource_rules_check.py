from pathlib import Path

rules=(Path(__file__).resolve().parents[1]/'firestore.rules').read_text(encoding='utf-8')

collections=[
    'master_units','master_unit_numbers','master_nozzles','master_droppers',
    'master_shifts','master_foremen','master_assistants',
    'master_water_qualities','master_weather_conditions',
]
for collection in collections:
    token=f"match /{collection}/"
    assert token in rules, f"Missing Firestore rules for {collection}"

assert rules.count("allow read: if activeUser();") >= len(collections)
assert rules.count("canEditKey('data_master_activity_resources',['owner','asisten'])") >= len(collections)
assert rules.count("allow delete: if activeUser() && role() == 'owner';") >= len(collections)

print("Firestore operational resource rules check passed: grouped masters are readable by active users, editable through Master Resource permission, and deletable by Owner.")
