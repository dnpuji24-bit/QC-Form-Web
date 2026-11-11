#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v java >/dev/null 2>&1; then
  echo "Java required by Firestore Emulator. Install JDK 21+ in Cloud Shell."
  exit 2
fi
if ! test -d node_modules/firebase-admin; then
  echo "Missing firebase-admin: run npm install --no-save firebase-admin"
  exit 2
fi
unset GOOGLE_APPLICATION_CREDENTIALS
export GCLOUD_PROJECT=demo-qc-photo-test
export FIREBASE_PROJECT_ID=demo-qc-photo-test
echo "Starting local Firestore Emulator for isolated metadata tests; no production project access."
npx --yes firebase-tools emulators:exec \
  --only firestore \
  --project demo-qc-photo-test \
  --config scripts/firebase.photo-emulator.json \
  "node scripts/test-qc-photo-metadata-emulator.mjs"
