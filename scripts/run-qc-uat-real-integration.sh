#!/usr/bin/env bash
set -euo pipefail
set +x
cd "$(dirname "$0")/.."
if [[ -v QC_UAT_STORAGE_SECRET ]]; then
  echo "Safety stop: use a clean shell." >&2
  exit 2
fi
node scripts/test-qc-uat-real-integration.mjs --self-test
test -d server/qc-photo-access/node_modules/@supabase/supabase-js
read -r -p "Type QC-UAT-INTEGRATION to authorize synthetic UAT storage writes and local Firebase emulator: " consent
[[ "$consent" == QC-UAT-INTEGRATION ]] || { echo "No changes made."; exit 2; }
read -rs -p "UAT project sb_secret_ key (hidden; never production key): " QC_UAT_STORAGE_SECRET
printf '\n'
trap 'unset QC_UAT_STORAGE_SECRET' EXIT
export QC_UAT_STORAGE_SECRET
export QC_UAT_STORAGE_ORIGIN="https://tcmtqgbpafwciaflgsaa.supabase.co"
export QC_UAT_STORAGE_WRITE="synthetic-only"
firebase emulators:exec --only firestore,auth --project demo-qc-uat-real-integration --config firebase.uat-real-integration-emulator.json 'env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID GCLOUD_PROJECT=demo-qc-uat-real-integration FIRESTORE_EMULATOR_HOST=127.0.0.1:8785 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9599 node scripts/test-qc-uat-real-integration.mjs --uat-write'
