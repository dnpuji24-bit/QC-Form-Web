#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm required in Cloud Shell." >&2
  exit 2
fi
if [[ "$SUPABASE_SECRET_KEY" != "" ]]; then
  echo "Safety stop: start with a clean shell; do not export this secret into shell history." >&2
  exit 2
fi
read -r -p "Existing test object path (UID/tests/photo.jpg): " QC_PHOTO_TEST_OBJECT_PATH
if [[ ! "$QC_PHOTO_TEST_OBJECT_PATH" =~ ^[A-Za-z0-9_-]{16,128}/tests/[A-Za-z0-9_-]{8,160}\.(jpg|png|webp)$ ]]; then
  echo "Invalid test object path; only existing objects under UID/tests/ are accepted." >&2
  exit 2
fi
read -rs -p "Supabase sb_secret_ key (hidden; not shown or saved): " SUPABASE_SECRET_KEY
printf '\n'
trap 'unset SUPABASE_SECRET_KEY QC_PHOTO_TEST_OBJECT_PATH' EXIT
if [[ "$SUPABASE_SECRET_KEY" != sb_secret_* ]]; then
  echo "Only a backend secret key (sb_secret_...) is accepted." >&2
  exit 2
fi
if [[ ! -f server/qc-photo-access/package-lock.json ]]; then
  echo "Installing server test dependencies in isolated server directory."
  npm install --prefix server/qc-photo-access --ignore-scripts --no-fund
else
  npm ci --prefix server/qc-photo-access --ignore-scripts --no-fund
fi
export SUPABASE_URL="https://mcfwnstdfhhtcbksgrlj.supabase.co"
export SUPABASE_SECRET_KEY QC_PHOTO_TEST_OBJECT_PATH
node server/qc-photo-access/test-real-storage-readonly.mjs
