"""Source-only inventory. Never reads live data, env files or credentials.
This is a hold check and an inventory, NOT evidence of tenant isolation.
"""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MARKER = "QC_HOSTED_UAT_ISOLATION_REQUIRED"
read = lambda p: (ROOT / p).read_text(encoding="utf-8")
workflow = read(".github/workflows/firebase-preview.yml")
vite = read("vite.config.ts")
firebase = read("src/firebase.ts")
assert "workflow_dispatch:" in workflow
assert "scripts/audit-qc-uat-isolation.py" in workflow
assert not any(t in workflow for t in ("action-hosting-deploy", "hosting:channel:deploy", "firebase deploy", "secrets.", "npm run build"))
assert MARKER in vite and vite.index(MARKER) < vite.index("if (command === 'build')")
assert MARKER in firebase and firebase.index(MARKER) < firebase.index("const firebaseConfig")
assert "demo-qc-photo-test" in firebase
paths = subprocess.check_output(["git", "ls-files", "-z", "--", "src", "supabase/functions", "scripts", "firestore.rules", "firestore.indexes.json"], cwd=ROOT).decode().split("\0")
categories = {
    "firestore_sdk": r"firebase/firestore|\b(?:getFirestore|initializeFirestore|collectionGroup|runTransaction|writeBatch)\s*\(",
    "firestore_paths": r"\b(?:doc|collection|collectionGroup)\s*\(|/documents/|/documents:|\bdocPath\s*\(",
    "auth": r"firebase/auth|identitytoolkit|\b(?:createUserWithEmailAndPassword|signInWithEmailAndPassword|initializeAuth)\s*\(",
    "legacy_target": r"daily-plan-and-report-unm|\bdailyplan\b",
    "production_target": r"form-qc-unm|mcfwnstdfhhtcbksgrlj",
    "uat_photo_target": r"tcmtqgbpafwciaflgsaa|qc-photos-uat",
    "legacy_transport": r"script\.google\.com|\bqcApi\.",
}
inventory = {key: [] for key in categories}
for path in sorted(set(paths) - {""}):
    p = ROOT / path
    if p.suffix not in {".ts", ".tsx", ".mjs", ".js", ".rules", ".json", ".sh"} or "release-artifacts/" in path:
        continue
    if not p.is_file() or p.is_symlink():
        continue
    source = p.read_text(encoding="utf-8")
    for key, pattern in categories.items():
        if re.search(pattern, source):
            inventory[key].append(path)
assert inventory["firestore_paths"], "Missing expected access inventory"
assert inventory["legacy_target"], "Unexpected legacy-target change; review before lifting hold"
assert inventory["uat_photo_target"], "Missing UAT photo references"
print(json.dumps({"targetProject": "form-qc-unm", "targetDatabase": "(default)", "targetChannel": "qc-cutover", "mode": "SOURCE_ONLY_HOLD", "counts": {k: len(v) for k, v in inventory.items()}, "files": inventory, "hostedUatApproved": False, "writes": 0}, indent=2))
print("SUCCESS: hosted UAT frozen; source inventory complete (not an isolation approval)")
