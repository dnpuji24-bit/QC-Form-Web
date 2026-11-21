#!/usr/bin/env bash
# 11D.5c.3b.2d — private signed-photo read and role gate (synthetic UAT only).
# This script never deploys to Firebase Hosting or writes to a real Firestore project.
set -euo pipefail
set +x
cd "$(dirname "$0")/../.."

if [[ "$(git branch --show-current)" != "feature/firebase-auth-claims-supabase" ]]; then
  echo "Safety stop: checkout the QC photo UAT feature branch first." >&2
  exit 2
fi
if [[ -v QC_UAT_STORAGE_SECRET ]]; then
  echo "Safety stop: open a clean shell; do not place keys in shell history." >&2
  exit 2
fi
command -v firebase >/dev/null || { echo "Firebase CLI required." >&2; exit 2; }

echo "=== Offline guards, no Supabase writes ==="
node scripts/test-qc-uat-unified-photo-ledger-contract.mjs
node scripts/test-qc-uat-unified-private-photo-store.mjs
node scripts/test-qc-uat-unified-private-photo-read-contract.mjs
npm run typecheck

if [[ ! -d server/qc-photo-access/node_modules/@supabase/supabase-js ]]; then
  echo "Safety stop: server SDK is not installed." >&2
  echo "Install the versions pinned in server/qc-photo-access/package.json in your Cloud Shell," >&2
  echo "review the generated local package-lock.json, and rerun this gate." >&2
  exit 2
fi

echo "This read gate writes 4 tiny SYNTHETIC photos to private Supabase UAT, tests 60s signed reads, then removes confirmed run objects."
echo "Firebase Auth and Firestore remain local EMULATORS. Acknowledged paths are removed only after all checks pass."
echo "Any failed/ambiguous run keeps its objects for deliberate run-scoped reconciliation."
read -r -p "Type QC-UAT-PRIVATE-READ to authorize this isolated live read gate: " consent
[[ "$consent" == "QC-UAT-PRIVATE-READ" ]] || { echo "No hosted writes made."; exit 2; }
read -rs -p "UAT qc-form-uat sb_secret_ key (hidden; NOT a production key): " QC_UAT_STORAGE_SECRET
printf '\n'
[[ "$QC_UAT_STORAGE_SECRET" == sb_secret_* ]] || {
  unset QC_UAT_STORAGE_SECRET
  echo "Safety stop: an sb_secret_ key for UAT is required." >&2
  exit 2
}
trap 'unset QC_UAT_STORAGE_SECRET' EXIT
export QC_UAT_STORAGE_SECRET
export QC_UAT_STORAGE_ORIGIN="https://tcmtqgbpafwciaflgsaa.supabase.co"
export QC_UAT_STORAGE_WRITE="synthetic-only"

firebase emulators:exec --only firestore,auth \
  --project demo-qc-uat-unified-role-planning \
  --config firebase.uat-unified-role-planning-emulator.json \
  "env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID QC_UAT_MODE=unified-lab GCLOUD_PROJECT=demo-qc-uat-unified-role-planning FIRESTORE_EMULATOR_HOST=127.0.0.1:9285 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:10099 node scripts/test-qc-uat-unified-photo-real-storage.mjs --uat-real-read"
