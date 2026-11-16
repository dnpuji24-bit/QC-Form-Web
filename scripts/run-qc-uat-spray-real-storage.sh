#!/usr/bin/env bash
set -euo pipefail
set +x
cd "$(dirname "$0")/.."
if [[ -v QC_UAT_STORAGE_SECRET ]]; then
  echo "Safety stop: use a clean shell." >&2
  exit 2
fi
node scripts/test-qc-uat-spray-real-storage.mjs --self-test
test -d server/qc-photo-access/node_modules/@supabase/supabase-js
read -r -p "Type QC-UAT-SPRAY-STORAGE to authorize synthetic UAT storage writes: " consent
[[ "$consent" == QC-UAT-SPRAY-STORAGE ]] || { echo "No changes made."; exit 2; }
read -rs -p "UAT project sb_secret_ key (hidden; never production key): " QC_UAT_STORAGE_SECRET
printf '\n'
trap 'unset QC_UAT_STORAGE_SECRET' EXIT
export QC_UAT_STORAGE_SECRET
export QC_UAT_STORAGE_ORIGIN="https://tcmtqgbpafwciaflgsaa.supabase.co"
export QC_UAT_STORAGE_WRITE="synthetic-only"
firebase emulators:exec --only firestore,auth --project demo-qc-uat-spray-photo --config firebase.uat-spray-photo-emulator.json 'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID GCLOUD_PROJECT=demo-qc-uat-spray-photo FIRESTORE_EMULATOR_HOST=127.0.0.1:9185 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9999 node scripts/test-qc-uat-spray-real-storage.mjs --uat-write'
