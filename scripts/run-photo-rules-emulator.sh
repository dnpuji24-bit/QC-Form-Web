#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v java >/dev/null 2>&1; then
  echo "Java is required for the Firestore Emulator."
  exit 2
fi
if ! test -d node_modules/@firebase/rules-unit-testing; then
  echo "Missing @firebase/rules-unit-testing. Install with:"
  echo "npm install --no-save --package-lock=false firebase-admin @firebase/rules-unit-testing"
  exit 2
fi
unset GOOGLE_APPLICATION_CREDENTIALS
export GCLOUD_PROJECT=demo-qc-photo-test
export FIREBASE_PROJECT_ID=demo-qc-photo-test
echo "Running Firebase Client SDK access tests against LOCAL Firestore Emulator only."
npx --yes firebase-tools emulators:exec \
  --only firestore \
  --project demo-qc-photo-test \
  --config scripts/firebase.photo-emulator.json \
  "node scripts/test-qc-photo-rules-emulator.mjs"
