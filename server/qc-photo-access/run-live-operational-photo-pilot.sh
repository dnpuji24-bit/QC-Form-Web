#!/usr/bin/env bash
set +x
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "$(gcloud config get-value project 2>/dev/null)" == form-qc-unm ]] || { echo WRONG_PROJECT; exit 2; }
[[ -z "${FIRESTORE_EMULATOR_HOST:-}${FIREBASE_AUTH_EMULATOR_HOST:-}" ]] || { echo EMULATOR_ENVIRONMENT; exit 2; }
test -d server/qc-photo-access/node_modules/firebase-admin || { echo SERVER_DEPENDENCIES_MISSING; exit 2; }
# Use the already-authorized CLI token without printing it or creating credentials.
gcloud auth print-access-token --quiet >/dev/null || { echo GCLOUD_ACCESS_TOKEN_UNAVAILABLE; exit 2; }
# Check the hosted gate and wrong-origin denial without real credentials before any Firestore writes.
for fn in upload sign; do
 url="https://mcfwnstdfhhtcbksgrlj.supabase.co/functions/v1/qc-photo-live-pilot-$fn"
 status=$(curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' --request POST --header 'Origin: https://form-qc-unm--react-test-ayyxz4hj.web.app' --header 'Content-Type: application/json' --header 'Authorization: Bearer invalid' --data '{}' "$url")
 [[ "$status" == 401 ]] || { echo "PILOT_NOT_READY $fn HTTP $status"; exit 2; }
done
read -r -p 'Create temporary synthetic Firestore fixtures and three tiny test images? Type TEST: ' confirm
[[ "$confirm" == TEST ]] || exit 2
trap 'unset TEST_OWNER_EMAIL TEST_OWNER_PASSWORD TEST_DENY_EMAIL TEST_DENY_PASSWORD' EXIT
read -r -p 'Authorized Owner Firebase email: ' TEST_OWNER_EMAIL
read -rs -p 'Owner password (hidden): ' TEST_OWNER_PASSWORD; echo
read -r -p 'Authorized active account with Data QC None Firebase email: ' TEST_DENY_EMAIL
read -rs -p 'Account password (hidden): ' TEST_DENY_PASSWORD; echo
export TEST_OWNER_EMAIL TEST_OWNER_PASSWORD TEST_DENY_EMAIL TEST_DENY_PASSWORD
export GOOGLE_CLOUD_PROJECT=form-qc-unm
node server/qc-photo-access/test-live-operational-photo-pilot.mjs --synthetic-live-confirmed
