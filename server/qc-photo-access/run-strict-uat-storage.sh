#!/usr/bin/env bash
set -euo pipefail
set +x
cd "$(dirname "$0")/../.."
if [[ -v QC_UAT_STORAGE_SECRET ]]; then
  echo "Safety stop: use a clean shell; do not export the secret into history." >&2
  exit 2
fi
node server/qc-photo-access/test-strict-uat-storage.mjs --self-test
test -d server/qc-photo-access/node_modules/@supabase/supabase-js \
  || { echo "Missing pinned server dependency; restore the existing server install before running."; exit 2; }
printf '%s\n' "This test writes synthetic objects only to qc-form-uat / qc-photos-uat, then removes acknowledged objects."
read -r -p "Type QC-UAT-STORAGE to authorize this synthetic test: " consent
[[ "$consent" == QC-UAT-STORAGE ]] || { echo "No changes made."; exit 2; }
read -rs -p "UAT project sb_secret_ key (hidden; never production key): " QC_UAT_STORAGE_SECRET
printf '\n'
trap 'unset QC_UAT_STORAGE_SECRET' EXIT
export QC_UAT_STORAGE_SECRET
export QC_UAT_STORAGE_ORIGIN="https://tcmtqgbpafwciaflgsaa.supabase.co"
export QC_UAT_STORAGE_WRITE="synthetic-only"
node server/qc-photo-access/test-strict-uat-storage.mjs --uat-write
