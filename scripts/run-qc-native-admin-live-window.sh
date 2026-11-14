#!/usr/bin/env bash
# Supervised synthetic-only pilot. No operational writes; no automatic document cleanup.
set +x
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
repo="$PWD"
[[ "$#" == 2 && -t 0 && -t 1 ]] || { echo INTERACTIVE_ONLY; exit 2; }
[[ "$(git branch --show-current)" == feature/firebase-auth-claims-supabase ]] || { echo WRONG_BRANCH; exit 2; }
bundle="$(realpath "$1")"
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
bash scripts/verify-qc-native-admin-candidate.sh "$bundle" "$backup"
work="$(mktemp -d "$HOME/qc-migration-private/admin-live-window-XXXXXX")"
echo "Private recovery workspace: $work"
node scripts/prepare-qc-native-admin-pilot-release.mjs --read-only-confirmed > "$work/preflight.txt"
cat "$work/preflight.txt"
fresh="$(node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");const i=s.lastIndexOf("\nSUCCESS:");if(i<0)process.exit(1);const p=JSON.parse(s.slice(0,i));if(p.blockers.length||p.writes!==0)process.exit(1);process.stdout.write(p.backupDirectory)' "$work/preflight.txt")"
node scripts/cleanup-qc-native-admin-pilot.mjs --verify-backup "$fresh"
printf '%s\n' "$fresh" > "$work/backup-path.txt"
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
 code="$(curl -sS --max-time 30 -o "$work/response.json" -w '%{http_code}' -X POST -H "Origin: $origin" -H 'Authorization: Bearer invalid' "$url")" || return 1
 [[ "$code" == "$1" ]] && node -e 'const x=require(process.argv[1]);if(x.error!==process.argv[2])process.exit(1)' "$work/response.json" "$2"
}
# Pre-stage the hard-OFF rollback independently of the live candidate.
(
 cd "$work"
 "$cli" init
 mkdir -p "supabase/functions/$slug"
)
dir="$work/supabase/functions/$slug"
cp "$bundle/quarantine.mjs" "$dir/quarantine.mjs"
printf "import './quarantine.mjs'\n" > "$dir/index.ts"
printf '{"imports":{}}\n' > "$dir/deno.json"
printf '%s  %s\n' 7cd9f42f30ed49e66d2af563147a0d44ed24235834cfa62a7f1fce1757891b90 "$dir/quarantine.mjs" | sha256sum -c -
[[ "$(rules_status)" == baseline ]]
verify_flag false
smoke 503 ADMIN_PILOT_DISABLED
echo 'PASS: baseline, OFF digest, OFF endpoint and rollback workspace'
# Do not export credentials to deployment commands.
unset TEST_OWNER_EMAIL TEST_OWNER_PASSWORD TEST_DENIED_EMAIL TEST_DENIED_PASSWORD
read -r -p 'Authorized active non-Owner Firebase email: ' TEST_DENIED_EMAIL
read -rs -p 'Non-Owner password (hidden): ' TEST_DENIED_PASSWORD; echo
read -r -p 'Authorized Owner Firebase email: ' TEST_OWNER_EMAIL
read -rs -p 'Owner password (hidden): ' TEST_OWNER_PASSWORD; echo
[[ -n "$TEST_DENIED_EMAIL" && -n "$TEST_DENIED_PASSWORD" && -n "$TEST_OWNER_EMAIL" && -n "$TEST_OWNER_PASSWORD" ]]
read -r -p 'No concurrent deployments allowed. Type TEST LIVE ADMIN to open one synthetic pilot window and roll back: ' answer
[[ "$answer" == 'TEST LIVE ADMIN' ]] || { echo CANCELLED; exit 2; }
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
 (cd "$work" && "$cli" functions deploy "$slug" "$deploy_target" --use-api --no-verify-jwt --import-map "$dir/deno.json" --yes) || { echo QUARANTINE_DEPLOY_NOT_VERIFIED; bad=1; }
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
 echo 'PASS: OFF digest, quarantine deployment, disabled smoke and baseline rules verified'
 echo 'Hosted quarantine source attestation and separate synthetic cleanup still required.'
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
verify_flag false
"$cli" secrets set "$flag=true" "$set_target" --yes
verify_flag true
# Only a malformed-token probe; never repeat a valid write request.
smoke 401 UNAUTHORIZED
echo 'PASS: pilot ON; one supervised synthetic transaction only'
TEST_DENIED_EMAIL="$TEST_DENIED_EMAIL" TEST_DENIED_PASSWORD="$TEST_DENIED_PASSWORD" \
TEST_OWNER_EMAIL="$TEST_OWNER_EMAIL" TEST_OWNER_PASSWORD="$TEST_OWNER_PASSWORD" \
timeout --foreground 180s node scripts/run-qc-native-admin-transaction.mjs --synthetic-live-confirmed
