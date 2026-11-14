#!/usr/bin/env bash
# Build and exercise isolated, self-contained candidates. No cloud deployment.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
[[ "$(git branch --show-current)" == feature/firebase-auth-claims-supabase ]] || { echo WRONG_BRANCH; exit 2; }
command -v deno >/dev/null
command -v node >/dev/null
root="$PWD"
dir=supabase/functions/qc-native-admin-live-pilot
git diff --exit-code HEAD -- "$dir" supabase/functions/_shared/qcOperationalPhotoIdentity.mjs scripts/test-qc-admin-pilot-bundle.mjs scripts/prepare-qc-admin-pilot-bundle.sh
# The earlier package check verifies the exact dependency lock and candidate config.
bash scripts/check-qc-admin-pilot-package.sh
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/src/qc-native-admin-live-pilot" "$work/src/_shared" "$work/bundles"
cp "$dir"/{index.ts,index.disabled.ts,handler.mjs,deno.json,deno.lock} "$work/src/qc-native-admin-live-pilot/"
cp supabase/functions/_shared/qcOperationalPhotoIdentity.mjs "$work/src/_shared/"
(
 cd "$work/src/qc-native-admin-live-pilot"
 deno check --config deno.json --node-modules-dir=none --frozen index.ts index.disabled.ts
 deno bundle --config deno.json --node-modules-dir=none --packages=bundle --platform=deno -o "$work/bundles/candidate.mjs" index.ts
 deno bundle --config deno.json --node-modules-dir=none --packages=bundle --platform=deno -o "$work/bundles/quarantine.mjs" index.disabled.ts
)
cmp -s "$work/src/qc-native-admin-live-pilot/deno.lock" "$root/$dir/deno.lock"
echo 'PASS: frozen dependency lock unchanged after bundling'
for file in candidate quarantine; do
 deno info --json --no-config --no-lock --no-npm --no-remote "$work/bundles/$file.mjs" > "$work/$file.graph.json"
 node --input-type=module - "$work/$file.graph.json" <<'NODE'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const g=JSON.parse(readFileSync(process.argv[2],'utf8'))
assert.equal(g.roots.length,1)
assert.equal(g.modules.length,1)
const m=g.modules[0]
assert.equal(m.specifier,g.roots[0])
assert.ok(!m.error)
assert.equal(m.dependencies?.length??0,0)
assert.equal(Object.keys(g.npmPackages??{}).length,0)
assert.equal(Object.keys(g.redirects??{}).length,0)
NODE
 node --check "$work/bundles/$file.mjs"
 echo "PASS: $file is a single module with no external imports"
done
node scripts/test-qc-admin-pilot-bundle.mjs "$work/bundles/quarantine.mjs" "$work/bundles/candidate.mjs"
parent="$HOME/qc-migration-private"
mkdir -p "$parent"
[[ -d "$parent" && ! -L "$parent" && "$(stat -c %a "$parent")" == 700 ]] || { echo PRIVATE_DIRECTORY_REQUIRED; exit 2; }
out=$(mktemp -d "$parent/native-admin-pilot-bundles-XXXXXX")
cp "$work/bundles/"*.mjs "$out/"
git rev-parse HEAD > "$out/source-commit.txt"
deno --version > "$out/deno-version.txt"
( cd "$out"; sha256sum candidate.mjs quarantine.mjs source-commit.txt deno-version.txt > SHA256SUMS; cat SHA256SUMS )
echo "Private bundle directory: $out"
echo 'SUCCESS: self-contained admin pilot bundles verified locally; no deployment or production writes'
