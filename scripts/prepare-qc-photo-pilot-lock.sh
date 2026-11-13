#!/usr/bin/env bash
# Produce a scoped dependency lock for the already-tested photo functions.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(git branch --show-current)" == feature/firebase-auth-claims-supabase ]] || { echo WRONG_BRANCH; exit 2; }
command -v deno >/dev/null
root="$PWD"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
for dir in _shared qc-photo-upload qc-photo-sign-operational qc-photo-live-pilot-upload qc-photo-live-pilot-sign; do
 mkdir -p "$work/$dir"
 case "$dir" in
  _shared) cp supabase/functions/"$dir"/qcOperationalPhotoIdentity.mjs "$work/$dir/";;
  qc-photo-upload) cp supabase/functions/"$dir"/{index,handler}.ts "$work/$dir/";;
  qc-photo-sign-operational) cp supabase/functions/"$dir"/{index,handler,manifest}.ts "$work/$dir/";;
  *) cp supabase/functions/"$dir"/index.ts "$work/$dir/";;
 esac
done
printf '%s\n' '{"nodeModulesDir":"none","lock":{"path":"./deno.lock"}}' > "$work/deno.json"
(
 cd "$work"
 deno check --node-modules-dir=none --frozen=false qc-photo-upload/index.ts qc-photo-sign-operational/index.ts qc-photo-live-pilot-upload/index.ts qc-photo-live-pilot-sign/index.ts
 deno check --node-modules-dir=none --frozen qc-photo-upload/index.ts qc-photo-sign-operational/index.ts qc-photo-live-pilot-upload/index.ts qc-photo-live-pilot-sign/index.ts
)
test -s "$work/deno.lock"
dest="$root/supabase/functions/qc-photo-pilot-deps.lock"
if [[ -e "$dest" ]]; then
 cmp -s "$work/deno.lock" "$dest" || { echo EXISTING_LOCK_DIFFERS_REVIEW_REQUIRED; exit 2; }
else
 cp "$work/deno.lock" "$dest"
fi
sha256sum "$dest"
echo "SUCCESS: isolated photo dependency lock generated and frozen check passed"
echo "Review and commit only supabase/functions/qc-photo-pilot-deps.lock"
