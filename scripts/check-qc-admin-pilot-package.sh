#!/usr/bin/env bash
# Verify the candidate package without deploying or changing any cloud resources.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(git branch --show-current)" == feature/firebase-auth-claims-supabase ]] || { echo WRONG_BRANCH; exit 2; }
command -v deno >/dev/null
root="$PWD"
dir=supabase/functions/qc-native-admin-live-pilot
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/qc-native-admin-live-pilot" "$work/_shared"
cp "$dir"/{index.ts,handler.mjs,deno.json,deno.lock} "$work/qc-native-admin-live-pilot/"
cp supabase/functions/_shared/qcOperationalPhotoIdentity.mjs "$work/_shared/"
node --input-type=module <<'NODE'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const dir='supabase/functions/qc-native-admin-live-pilot/'
const config=JSON.parse(readFileSync(dir+'deno.json','utf8'))
const lock=JSON.parse(readFileSync(dir+'deno.lock','utf8'))
const old=JSON.parse(readFileSync('supabase/functions/qc-photo-pilot-deps.lock','utf8'))
assert.deepEqual(config,{nodeModulesDir:'none',lock:{path:'./deno.lock',frozen:true},imports:{}})
assert.deepEqual(lock.specifiers,{'npm:jose@6.1.0':'6.1.0'})
assert.deepEqual(lock.npm,{'jose@6.1.0':old.npm['jose@6.1.0']})
const toml=readFileSync('supabase/config.toml','utf8')
const section=toml.split('[functions.qc-native-admin-live-pilot]')
assert.equal(section.length,2)
assert.match(section[1],/^\s*enabled = false\s*verify_jwt = false\s*$/)
console.log('PASS: exact scoped dependency and candidate deployment remains disabled')
NODE
(
 cd "$work/qc-native-admin-live-pilot"
 deno check --config deno.json --node-modules-dir=none --frozen index.ts
)
cmp -s "$work/qc-native-admin-live-pilot/deno.lock" "$root/$dir/deno.lock"
echo 'PASS: isolated frozen lock unchanged'
node scripts/test-qc-native-admin-live-pilot.mjs
sha256sum "$dir"/{index.ts,handler.mjs,deno.json,deno.lock} supabase/functions/_shared/qcOperationalPhotoIdentity.mjs scripts/firestore.native-admin-pilot-release.rules
echo 'SUCCESS: isolated admin pilot package verified; no deployment or production writes'
