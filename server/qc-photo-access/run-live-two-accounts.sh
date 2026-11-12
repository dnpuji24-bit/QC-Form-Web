#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ "$(gcloud config get-value project 2>/dev/null)" != "form-qc-unm" ]]; then
  echo "Safety stop: select form-qc-unm first."; exit 2
fi
read -r -p "Run temporary staging-only writes and cleanup? Type TEST: " confirm
[[ "$confirm" == TEST ]] || exit 2
test -d server/qc-photo-access/node_modules || npm install --prefix server/qc-photo-access --ignore-scripts --no-fund
read -r -p "Firebase email with Data QC View/Edit (your authorized test account): " TEST_ALLOW_EMAIL
read -rs -p "Password (hidden): " TEST_ALLOW_PASSWORD; echo
read -r -p "Firebase email with Data QC None (your authorized test account): " TEST_DENY_EMAIL
read -rs -p "Password (hidden): " TEST_DENY_PASSWORD; echo
read -rs -p "Supabase sb_secret_ key (hidden): " SUPABASE_SECRET_KEY; echo
trap 'unset TEST_ALLOW_EMAIL TEST_ALLOW_PASSWORD TEST_DENY_EMAIL TEST_DENY_PASSWORD SUPABASE_SECRET_KEY' EXIT
export TEST_ALLOW_EMAIL TEST_ALLOW_PASSWORD TEST_DENY_EMAIL TEST_DENY_PASSWORD SUPABASE_SECRET_KEY
export GOOGLE_CLOUD_PROJECT=form-qc-unm
node server/qc-photo-access/test-live-two-accounts.mjs
