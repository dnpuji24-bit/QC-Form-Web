#!/usr/bin/env bash
# Corrected v9 synthetic-only pilot. Default is read-only; explicit --live required.
set +x
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
repo="$PWD"
unset SUPABASE_WORKDIR
apply=false
if [[ "${1:-}" == --live ]]; then apply=true; shift; fi
[[ "$#" == 2 ]] || { echo 'USAGE: run-qc-native-admin-v9-live-window.sh [--live] BUNDLE_DIR BACKUP_DIR'; exit 2; }
if $apply && [[ ! -t 0 || ! -t 1 ]]; then echo INTERACTIVE_ONLY; exit 2; fi
[[ "$(git branch --show-current)" == feature/firebase-auth-claims-supabase ]] || { echo WRONG_BRANCH; exit 2; }
bundle="$(realpath "$1")"
reviewed=33328dc237c19ea434f6d85d9d4ddd36b3512a2b
paths=(scripts/verify-qc-native-admin-candidate-fix.sh scripts/prepare-qc-native-admin-pilot-release.mjs scripts/cleanup-qc-native-admin-pilot.mjs scripts/run-qc-native-admin-transaction.mjs scripts/firestore.legacy-audit-release.rules scripts/firestore.native-admin-pilot-release.rules scripts/release-artifacts/qc-native-admin-live-pilot/quarantine.mjs src/firebase.ts)
git merge-base --is-ancestor "$reviewed" HEAD
git diff --exit-code "$reviewed" -- "${paths[@]}"
backup="$(realpath "$2")"
project=form-qc-unm
ref=mcfwnstdfhhtcbksgrlj
slug=qc-native-admin-live-pilot
flag=QC_NATIVE_ADMIN_LIVE_PILOT_ENABLED
origin=https://form-qc-unm--react-test-ayyxz4hj.web.app
url="https://$ref.supabase.co/functions/v1/$slug"
cli="$(command -v supabase)"
fb="$(command -v firebase || true)"
[[ -n "$fb" ]] || fb="$repo/node_modules/.bin/firebase"
[[ -x "$fb" ]] || { echo FIREBASE_CLI_REQUIRED; exit 2; }
command -v timeout >/dev/null
target_args(){
 if [[ "$1" == *--project-ref* ]]; then printf '%s\n' "--project-ref=$ref"
 elif [[ "$1" == *--remote* ]]; then printf '%s\n' "--remote=$ref"
 else return 2; fi
}
set_target="$(target_args "$("$cli" secrets set --help)")"
list_target="$(target_args "$("$cli" secrets list --help)")"
deploy_help="$("$cli" functions deploy --help)"
deploy_target="$(target_args "$deploy_help")"
[[ "$deploy_help" == *--use-api* && "$deploy_help" == *--no-verify-jwt* && "$deploy_help" == *--import-map* ]] || { echo CLI_DEPLOY_FLAGS_UNSUPPORTED; exit 2; }
functions_target="$(target_args "$("$cli" functions list --help)")"
download_help="$("$cli" functions download --help)"
download_target="$(target_args "$download_help")"
[[ "$download_help" == *--use-api* ]] || { echo CLI_DOWNLOAD_API_REQUIRED; exit 2; }
bash scripts/verify-qc-native-admin-candidate-fix.sh "$bundle" "$backup"
work="$(mktemp -d "$HOME/qc-migration-private/admin-v9-live-window-XXXXXX")"
echo "Private recovery workspace: $work"
fresh_audit(){
 node scripts/prepare-qc-native-admin-pilot-release.mjs --read-only-confirmed > "$work/preflight.txt"
 cat "$work/preflight.txt"
 fresh="$(node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");const i=s.lastIndexOf("\nSUCCESS:");if(i<0)process.exit(1);const p=JSON.parse(s.slice(0,i));if(p.project!=="form-qc-unm"||!Array.isArray(p.blockers)||p.blockers.length||p.writes!==0||p.releaseApproved!==false||p.pilotCollections?.qc_admin_live_pilot_state!=="empty"||p.pilotCollections?.qc_admin_live_pilot_audit!=="empty")process.exit(1);process.stdout.write(p.backupDirectory)' "$work/preflight.txt")"
 node scripts/cleanup-qc-native-admin-pilot.mjs --verify-backup "$fresh"
 printf '%s\n' "$fresh" > "$work/backup-path.txt"
}
fresh_audit
rules_status(){
 node --input-type=module - "$fresh" <<'NODE'
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const project='form-qc-unm',dir=process.argv[2]
const cli=a=>execFileSync('gcloud',a,{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:30000}).trim()
if(cli(['config','get-value','project','--quiet'])!==project)throw Error('WRONG_PROJECT')
const token=cli(['auth','print-access-token','--quiet'])
if(!token)throw Error('AUTH_REQUIRED')
const base='https://firebaserules.googleapis.com/v1/',p='projects/'+project+'/releases/cloud.firestore'
async function get(path){const r=await fetch(base+path,{headers:{Authorization:'Bearer '+token,'X-Goog-User-Project':project},redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('RULES_READ_HTTP_'+r.status);return r.json()}
const r=await get(p)
if(r.name!==p||!/^projects\/form-qc-unm\/rulesets\/[A-Za-z0-9_-]+$/.test(r.rulesetName||''))throw Error('INVALID_RELEASE')
const f=(await get(r.rulesetName)).source?.files
if(!Array.isArray(f)||f.length!==1||typeof f[0].content!=='string')throw Error('INVALID_RULES_SOURCE')
const hash=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n').trimEnd()).digest('hex')
const h=hash(f[0].content),latest=await get(p)
if(latest.rulesetName!==r.rulesetName||latest.updateTime!==r.updateTime)throw Error('RULES_CHANGED')
const b=hash(readFileSync(dir+'/rollback.rules','utf8')),c=hash(readFileSync(dir+'/candidate.rules','utf8'))
if(b!=='1969b01dc886befc8fa65982c5a57fcbf464581a73a1e4916e1485f8922e8e5c'||b===c)throw Error('BACKUP_CHANGED')
console.log(h===b?'baseline':h===c?'candidate':'unexpected')
NODE
}
verify_flag(){
 local expected
 expected="$(printf '%s' "$1" | sha256sum | cut -d' ' -f1)"
 "$cli" secrets list "$list_target" -o json | node --input-type=module -e '
 import {readFileSync} from "node:fs";
 const rows=JSON.parse(readFileSync(0,"utf8"));
 if(!Array.isArray(rows))process.exit(1);
 const matches=rows.filter(x=>x.name===process.argv[1]);
 if(matches.length!==1||(matches[0].digest??matches[0].value)!==process.argv[2])process.exit(1);
 ' "$flag" "$expected"
}
smoke(){
 local code
 code="$(curl -q -sS --max-time 30 -o "$work/response.json" -w '%{http_code}' -X POST -H "Origin: $origin" -H 'Authorization: Bearer invalid' "$url")" || return 1
 [[ "$code" == "$1" ]] && node -e 'const x=require(process.argv[1]);if(x.error!==process.argv[2])process.exit(1)' "$work/response.json" "$2"
}
hosted_version(){
 "$cli" functions list "$functions_target" -o json | node --input-type=module -e '
 import {readFileSync} from "node:fs";
 const matches=JSON.parse(readFileSync(0,"utf8")).filter(x=>x.slug===process.argv[1]);
 const [f]=matches;
 if(matches.length!==1||f.status!=="ACTIVE"||f.id!=="ecde3c88-dd7c-44d9-8300-a90a32514010"||
    f.verify_jwt!==false||f.import_map!==true||!Number.isSafeInteger(f.version)||f.version<8||
    !f.entrypoint_path?.endsWith("/"+process.argv[1]+"/index.ts")||
    !f.import_map_path?.endsWith("/"+process.argv[1]+"/deno.json"))process.exit(1);
 console.log(f.version);
 ' "$slug"
}

attest_hosted(){
 local kind="$1" minimum="$2" before after download dir expected
 before="$(hosted_version)" && (( before >= minimum )) || return 1
 download="$(mktemp -d "$work/hosted-XXXXXX")" || return 1
 "$cli" init --workdir "$download" || return 1
 "$cli" functions download "$slug" "$download_target" --use-api --workdir "$download" || return 1
 dir="$download/supabase/functions/$slug"
 expected="$work/$kind/supabase/functions/$slug"
 diff -qr -- "$expected" "$dir" || return 1
 after="$(hosted_version)" && [[ "$before" == "$after" ]] || return 1
 echo "PASS: hosted $kind v$after matches staged source and function settings"
}

# Stage exact v9 candidate and the original reviewed quarantine, never the rebuilt quarantine.
stage(){
 local kind="$1" source="$2" digest="$3" dir="$work/$1/supabase/functions/$slug"
 mkdir -p "$dir"
 if [[ "$kind" == quarantine ]]; then "$cli" init --workdir "$work/$kind"; fi
 cp -- "$source" "$dir/$kind.mjs"
 printf '%s  %s\n' "$digest" "$dir/$kind.mjs" | sha256sum -c -
 printf "import './%s.mjs'\n" "$kind" > "$dir/index.ts"
 printf '{"imports":{}}\n' > "$dir/deno.json"
}
candidate_hash=36c29d0770fde1a2f692045409d424a109f0b3da1648400ba49f015feb859bc8
quarantine_hash=7cd9f42f30ed49e66d2af563147a0d44ed24235834cfa62a7f1fce1757891b90
stage candidate "$bundle/candidate.mjs" "$candidate_hash"
stage quarantine "$repo/scripts/release-artifacts/$slug/quarantine.mjs" "$quarantine_hash"
verify_v9(){
 [[ "$(hosted_version)" == 9 ]] && attest_hosted candidate 9 && [[ "$(hosted_version)" == 9 ]]
}
verify_v9
[[ "$(rules_status)" == baseline ]]
verify_flag false
smoke 503 ADMIN_PILOT_DISABLED
echo 'PASS: exact hosted v9, baseline rules, OFF digest, OFF endpoint and original rollback workspace'
if ! $apply; then
 echo 'SUCCESS: corrected v9 live-window read-only preflight; no deployment, activation or document writes'
 exit 0
fi
# Do not export credentials to deployment commands.
unset TEST_OWNER_EMAIL TEST_OWNER_PASSWORD TEST_DENIED_EMAIL TEST_DENIED_PASSWORD
read -r -p 'Authorized active non-Owner Firebase email: ' TEST_DENIED_EMAIL
read -rs -p 'Non-Owner password (hidden): ' TEST_DENIED_PASSWORD; echo
read -r -p 'Authorized Owner Firebase email: ' TEST_OWNER_EMAIL
read -rs -p 'Owner password (hidden): ' TEST_OWNER_PASSWORD; echo
[[ -n "$TEST_DENIED_EMAIL" && -n "$TEST_DENIED_PASSWORD" && -n "$TEST_OWNER_EMAIL" && -n "$TEST_OWNER_PASSWORD" ]]
read -r -p 'No concurrent deployments allowed. Type TEST LIVE ADMIN V9 to open one synthetic pilot window and roll back: ' answer
[[ "$answer" == 'TEST LIVE ADMIN V9' ]] || { echo CANCELLED; exit 2; }
fresh_audit
verify_v9
[[ "$(rules_status)" == baseline ]]
verify_flag false
smoke 503 ADMIN_PILOT_DISABLED
node scripts/cleanup-qc-native-admin-pilot.mjs --verify-backup "$fresh"
rollback(){
 local rc=$? bad=0 current
 trap - EXIT
 trap '' INT TERM HUP
 set +e
 unset TEST_OWNER_EMAIL TEST_OWNER_PASSWORD TEST_DENIED_EMAIL TEST_DENIED_PASSWORD
 echo 'ROLLBACK: disabling pilot and restoring hard OFF bundle and baseline rules'
 "$cli" secrets set "$flag=false" "$set_target" --yes && verify_flag false || { echo FLAG_OFF_NOT_VERIFIED; bad=1; }
 # Only overwrite our still-attested v9; unexpected hosted drift is not overwritten.
 if verify_v9; then
  local dir="$work/quarantine/supabase/functions/$slug"
  if printf '%s  %s\n' "$quarantine_hash" "$dir/quarantine.mjs" | sha256sum -c -; then
   "$cli" functions deploy "$slug" "$deploy_target" --use-api --no-verify-jwt --import-map "$dir/deno.json" --workdir "$work/quarantine" --yes || echo QUARANTINE_DEPLOY_RESULT_UNCERTAIN
  else
   echo QUARANTINE_ARTIFACT_CHANGED
   bad=1
  fi
 else
  echo HOSTED_DRIFT_NO_OVERWRITE
 fi
 attest_hosted quarantine 10 || { echo QUARANTINE_SOURCE_NOT_VERIFIED; bad=1; }
 smoke 503 ADMIN_PILOT_DISABLED || { echo HOSTED_OFF_NOT_VERIFIED; bad=1; }
 current="$(rules_status)" || current=unavailable
 if [[ "$current" == candidate ]]; then
  node scripts/cleanup-qc-native-admin-pilot.mjs --verify-backup "$fresh" && "$fb" deploy --only firestore:rules --project "$project" --config "$fresh/firebase.rollback.json" --non-interactive || { echo RULES_ROLLBACK_COMMAND_FAILED; bad=1; }
 elif [[ "$current" != baseline ]]; then
  echo UNKNOWN_RULES_DO_NOT_OVERWRITE
  bad=1
 fi
 [[ "$(rules_status)" == baseline ]] || { echo BASELINE_NOT_VERIFIED; bad=1; }
 if (( bad )); then echo "ROLLBACK_INCOMPLETE_MANUAL_REVIEW: $work"; exit 3; fi
 echo 'PASS: OFF digest, exact hosted original quarantine source, disabled smoke and baseline rules verified'
 echo 'Separate exact synthetic cleanup/read-only verification still required.'
 if (( rc )); then echo 'LIVE_TEST_NOT_CONFIRMED_DO_NOT_RETRY'; exit "$rc"; fi
 echo 'SUCCESS: supervised live test and rollback completed; no automatic document cleanup'
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
"$fb" deploy --only firestore:rules --project "$project" --config "$fresh/firebase.candidate.json" --non-interactive
[[ "$(rules_status)" == candidate ]]
echo 'PASS: isolated candidate rules released; allowing rules propagation'
sleep 65
[[ "$(rules_status)" == candidate ]]
verify_v9
verify_flag false
"$cli" secrets set "$flag=true" "$set_target" --yes
verify_flag true
verify_v9
# Only a malformed-token probe; never repeat a valid write request.
smoke 401 UNAUTHORIZED
echo 'PASS: corrected pilot v9 ON; one supervised synthetic transaction only'
TEST_DENIED_EMAIL="$TEST_DENIED_EMAIL" TEST_DENIED_PASSWORD="$TEST_DENIED_PASSWORD" \
TEST_OWNER_EMAIL="$TEST_OWNER_EMAIL" TEST_OWNER_PASSWORD="$TEST_OWNER_PASSWORD" \
timeout --foreground 180s node scripts/run-qc-native-admin-transaction.mjs --synthetic-live-confirmed
