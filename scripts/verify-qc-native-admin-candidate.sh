#!/usr/bin/env bash
# Verify only; never deploy, enable flags, commit, or modify Firestore.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
[[ "$#" == 2 ]] || { echo 'USAGE: verify-qc-native-admin-candidate.sh BUNDLE_DIR BACKUP_DIR'; exit 2; }
[[ "$(git branch --show-current)" == feature/firebase-auth-claims-supabase ]] || { echo WRONG_BRANCH; exit 2; }
bundle="$1"
backup="$2"
parent="$HOME/qc-migration-private"
[[ -d "$bundle" && ! -L "$bundle" && "$(realpath "$bundle")" == "$parent"/native-admin-pilot-bundles-* && "$(stat -c %a "$bundle")" == 700 ]] || { echo PRIVATE_BUNDLE_REQUIRED; exit 2; }
for f in candidate.mjs quarantine.mjs source-commit.txt deno-version.txt SHA256SUMS; do
 [[ -f "$bundle/$f" && ! -L "$bundle/$f" && "$(stat -c %a "$bundle/$f")" == 600 ]] || { echo PRIVATE_FILE_REQUIRED; exit 2; }
done
(
 cd "$bundle"
 sha256sum -c SHA256SUMS
 printf '%s  %s\n' \
  15b8a73a654bc2029db647f6de04d82f34ccc092a51d8c4c6e987c8ac8b24701 candidate.mjs \
  7cd9f42f30ed49e66d2af563147a0d44ed24235834cfa62a7f1fce1757891b90 quarantine.mjs \
  4f0b3da76d4c3a54a3eeecd8bfd6e8827f4cba94711f21ffb572978f2583ab9f source-commit.txt \
 | sha256sum -c -
)
cmp "$bundle/quarantine.mjs" scripts/release-artifacts/qc-native-admin-live-pilot/quarantine.mjs
echo 'PASS: rollback bundle equals reviewed GitHub artifact'
node --input-type=module - "$bundle/quarantine.mjs" "$bundle/candidate.mjs" <<'NODE'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const q=readFileSync(process.argv[2],'utf8'),c=readFileSync(process.argv[3],'utf8')
const old='var env = (name) => name === "QC_NATIVE_ADMIN_LIVE_PILOT_ENABLED" ? "false" : Deno.env.get(name);'
assert.equal(q.split(old).length,2)
assert.equal(q.split('// index.disabled.ts').length,2)
assert.equal(q.replace('// index.disabled.ts','// index.ts').replace(old,'var env = (name) => Deno.env.get(name);'),c)
console.log('PASS: exact candidate reconstructed from quarantine with only source label and env gate changed')
NODE
source_commit=$(cat "$bundle/source-commit.txt")
[[ "$source_commit" =~ ^[0-9a-f]{40}$ ]] || { echo INVALID_SOURCE_COMMIT; exit 2; }
git merge-base --is-ancestor "$source_commit" HEAD
git diff --exit-code "$source_commit" HEAD -- supabase/functions/qc-native-admin-live-pilot supabase/functions/_shared/qcOperationalPhotoIdentity.mjs scripts/firestore.native-admin-pilot-release.rules scripts/test-qc-admin-pilot-bundle.mjs scripts/prepare-qc-admin-pilot-bundle.sh
git diff --exit-code HEAD -- supabase/functions/qc-native-admin-live-pilot supabase/functions/_shared/qcOperationalPhotoIdentity.mjs scripts/firestore.native-admin-pilot-release.rules scripts/test-qc-admin-pilot-bundle.mjs scripts/prepare-qc-admin-pilot-bundle.sh scripts/release-artifacts/qc-native-admin-live-pilot/quarantine.mjs
echo 'PASS: reviewed source and candidate rules unchanged'
node scripts/cleanup-qc-native-admin-pilot.mjs --verify-backup "$backup"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
for file in candidate quarantine; do
 deno info --json --no-config --no-lock --no-npm --no-remote "$bundle/$file.mjs" > "$work/$file.json"
 node --input-type=module - "$work/$file.json" <<'NODE'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const g=JSON.parse(readFileSync(process.argv[2],'utf8'))
assert.equal(g.roots.length,1)
assert.equal(g.modules.length,1)
assert.equal(g.modules[0].specifier,g.roots[0])
assert.ok(!g.modules[0].error)
assert.equal(g.modules[0].dependencies?.length??0,0)
assert.equal(Object.keys(g.npmPackages??{}).length,0)
assert.equal(Object.keys(g.redirects??{}).length,0)
NODE
 node --check "$bundle/$file.mjs"
 echo "PASS: $file is standalone"
done
node scripts/test-qc-admin-pilot-bundle.mjs "$bundle/quarantine.mjs" "$bundle/candidate.mjs"
node scripts/run-qc-native-admin-transaction.mjs --self-test
if grep -Eq 'AIza[0-9A-Za-z_-]{35}|gh[pousr]_[0-9A-Za-z]{30,}|ya29\.[0-9A-Za-z_-]{20,}' "$bundle/candidate.mjs"; then
 echo POSSIBLE_SENSITIVE_CONTENT
 exit 2
fi
echo 'PASS: candidate matches pinned local artifact; credential pattern scan clean (not exhaustive)'
echo 'SUCCESS: candidate and rollback artifacts verified; no deployment, writes or activation'
