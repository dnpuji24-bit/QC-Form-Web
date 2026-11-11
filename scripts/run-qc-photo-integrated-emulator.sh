#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v java >/dev/null 2>&1; then echo "Java required"; exit 2; fi
if ! test -f scripts/firestore.photo-emulator.rules; then echo "Missing isolated emulator rules"; exit 2; fi
if ! grep -q '"rules": "firestore.photo-emulator.rules"' scripts/firebase.photo-emulator.json; then echo "Safety stop: rules path mismatch"; exit 2; fi
if ! test -d node_modules/@firebase/rules-unit-testing; then
 echo "Install test dependency first: npm install --no-save --package-lock=false firebase-admin @firebase/rules-unit-testing"
 exit 2
fi
unset GOOGLE_APPLICATION_CREDENTIALS
export GCLOUD_PROJECT=demo-qc-photo-test
export FIREBASE_PROJECT_ID=demo-qc-photo-test
npx --yes firebase-tools emulators:exec \
  --only firestore \
  --project demo-qc-photo-test \
  --config scripts/firebase.photo-emulator.json \
  "node scripts/test-qc-photo-integrated-emulator.mjs"
