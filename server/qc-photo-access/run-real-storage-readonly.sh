#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm required in Cloud Shell." >&2
  exit 2
fi
if [[ -v SUPABASE_SECRET_KEY ]]; then
  echo "Safety stop: start with a clean shell; do not export this secret into shell history." >&2
  exit 2
fi
read -rs -p "Supabase sb_secret_ key (hidden; not shown or saved): " SUPABASE_SECRET_KEY
printf '\n'
trap 'unset SUPABASE_SECRET_KEY' EXIT
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
export SUPABASE_SECRET_KEY
node server/qc-photo-access/test-real-storage-readonly.mjs
