#!/usr/bin/env bash
# Only the read-only preflight is allowed by this wrapper.
set +x
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$#" == 0 && -t 0 && -t 1 ]] || { echo INTERACTIVE_PREFLIGHT_ONLY; exit 2; }
[[ "$(git branch --show-current)" == feature/firebase-auth-claims-supabase ]] || { echo WRONG_BRANCH; exit 2; }
[[ "$(gcloud config get-value project 2>/dev/null)" == form-qc-unm ]] || { echo WRONG_PROJECT; exit 2; }
[[ -z "${FIRESTORE_EMULATOR_HOST:-}${FIREBASE_AUTH_EMULATOR_HOST:-}" ]] || { echo EMULATOR_ENVIRONMENT; exit 2; }
gcloud auth print-access-token --quiet >/dev/null || { echo GCLOUD_AUTH_REQUIRED; exit 2; }
unset TEST_OWNER_EMAIL TEST_OWNER_PASSWORD TEST_DENIED_EMAIL TEST_DENIED_PASSWORD
trap 'unset TEST_OWNER_EMAIL TEST_OWNER_PASSWORD TEST_DENIED_EMAIL TEST_DENIED_PASSWORD' EXIT
read -r -p 'Authorized active non-Owner Firebase email: ' TEST_DENIED_EMAIL
read -rs -p 'Non-Owner password (hidden): ' TEST_DENIED_PASSWORD; echo
read -r -p 'Authorized Owner Firebase email: ' TEST_OWNER_EMAIL
read -rs -p 'Owner password (hidden): ' TEST_OWNER_PASSWORD; echo
export TEST_OWNER_EMAIL TEST_OWNER_PASSWORD TEST_DENIED_EMAIL TEST_DENIED_PASSWORD
node scripts/run-qc-native-admin-transaction.mjs --preflight-confirmed
