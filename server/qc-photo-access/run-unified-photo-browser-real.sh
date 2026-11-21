#!/usr/bin/env bash
# 11D.5c.3b.2e.4: compact DELTA gate: private signed preview + all MIME formats.
# No Firebase production, Hosting, Cloud Billing, public URLs or client-side secret.
set -euo pipefail
set +x
cd "$(dirname "$0")/../.."

[[ "$(git branch --show-current)" == "feature/firebase-auth-claims-supabase" ]] || {
 echo "Safety stop: use the isolated feature branch." >&2; exit 2;
}
if [[ -v QC_UAT_STORAGE_SECRET ]]; then
 echo "Safety stop: open a clean shell without exported UAT secrets." >&2; exit 2
fi
command -v firebase >/dev/null || { echo "Firebase CLI required" >&2; exit 2; }
test -d server/qc-photo-access/node_modules/@supabase/supabase-js || {
 echo "Safety stop: trusted server Supabase SDK dependency missing." >&2; exit 2;
}
export QC_UAT_PLAYWRIGHT_DIR="${QC_UAT_PLAYWRIGHT_DIR:-${HOME}/qc-uat-playwright}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${HOME}/.cache/ms-playwright}"
test -f "$QC_UAT_PLAYWRIGHT_DIR/package.json" || {
 echo "Safety stop: local Playwright directory not installed." >&2; exit 2;
}

echo "=== Compact preflight: changed route, signer and browser gate (no hosted writes) ==="
node --check server/qc-photo-access/uat-unified-planning-http.mjs
node --check server/qc-photo-access/uat-unified-private-photo-read.mjs
node --check server/qc-photo-access/uat-unified-browser-shell.mjs
node --check scripts/test-qc-uat-unified-full-qc-ui.mjs
npm run typecheck

echo
echo "EXPLICIT LIVE UAT: 4 synthetic PNG/JPEG/WebP objects plus signed browser previews in private qc-photos-uat ONLY."
echo "Auth and Firestore use demo emulators, not form-qc-unm."
echo "After ALL browser assertions pass, only exactly 4 committed run-owned objects may be removed."
echo "On failure or ambiguous cleanup, leave objects in place for run-specific reconciliation."
read -r -p "Type QC-UAT-BROWSER-PREVIEW to authorize this synthetic-only live gate: " consent
[[ "$consent" == "QC-UAT-BROWSER-PREVIEW" ]] || { echo "No hosted writes made."; exit 2; }

read -rs -p "qc-form-uat Supabase sb_secret_ key (hidden terminal input): " QC_UAT_STORAGE_SECRET
printf '\n'
if [[ ! "$QC_UAT_STORAGE_SECRET" =~ ^sb_secret_[A-Za-z0-9_-]{10,}$ ]]; then
 unset QC_UAT_STORAGE_SECRET
 echo "Safety stop: only a private key for the qc-form-uat project is accepted." >&2
 exit 2
fi
trap 'unset QC_UAT_STORAGE_SECRET' EXIT
export QC_UAT_STORAGE_SECRET
export QC_UAT_STORAGE_ORIGIN="https://tcmtqgbpafwciaflgsaa.supabase.co"
export QC_UAT_STORAGE_WRITE="synthetic-only"

firebase emulators:exec --only firestore,auth \
 --project demo-qc-uat-unified-role-planning \
 --config firebase.uat-unified-role-planning-emulator.json \
 "env -u GOOGLE_CLOUD_PROJECT -u FIREBASE_PROJECT_ID QC_UAT_MODE=unified-lab GCLOUD_PROJECT=demo-qc-uat-unified-role-planning FIRESTORE_EMULATOR_HOST=127.0.0.1:9285 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:10099 node scripts/test-qc-uat-unified-full-qc-ui.mjs --browser-photo-real"
