#!/usr/bin/env bash
# One scoped Edge Function deployment, with explicit OFF and quarantine fallback.
set +x
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
repo="$PWD"
[[ "$#" == 2 && -t 0 && -t 1 ]] || { echo INTERACTIVE_ONLY; exit 2; }
[[ "$(git branch --show-current)" == feature/firebase-auth-claims-supabase ]] || { echo WRONG_BRANCH; exit 2; }
bundle="$(realpath "$1")"
backup="$(realpath "$2")"
ref=mcfwnstdfhhtcbksgrlj
slug=qc-native-admin-live-pilot
flag=QC_NATIVE_ADMIN_LIVE_PILOT_ENABLED
origin=https://form-qc-unm--react-test-ayyxz4hj.web.app
url="https://$ref.supabase.co/functions/v1/$slug"
if command -v supabase >/dev/null; then cli="$(command -v supabase)"
elif [[ -x "$repo/node_modules/.bin/supabase" ]]; then cli="$repo/node_modules/.bin/supabase"
else echo SUPABASE_CLI_REQUIRED; exit 2; fi
"$cli" --version
# Detect supported explicit remote flags; never deploy to an implicit linked project.
secret_help="$("$cli" secrets set --help)"
list_help="$("$cli" secrets list --help)"
deploy_help="$("$cli" functions deploy --help)"
target_args(){
 if [[ "$1" == *--project-ref* ]]; then printf '%s\n' "--project-ref=$ref"
 elif [[ "$1" == *--remote* ]]; then printf '%s\n' "--remote=$ref"
 else return 2; fi
}
set_target="$(target_args "$secret_help")"
list_target="$(target_args "$list_help")"
deploy_target="$(target_args "$deploy_help")"
[[ "$deploy_help" == *--use-api* && "$deploy_help" == *--no-verify-jwt* && "$deploy_help" == *--import-map* ]] || { echo CLI_DEPLOY_FLAGS_UNSUPPORTED; exit 2; }
bash scripts/verify-qc-native-admin-candidate.sh "$bundle" "$backup"
node scripts/prepare-qc-native-admin-pilot-release.mjs --read-only-confirmed
work="$(mktemp -d "$HOME/qc-migration-private/admin-off-deploy-XXXXXX")"
echo "Private deployment workspace: $work"
cd "$work"
"$cli" init
mkdir -p "supabase/functions/$slug"
dir="$work/supabase/functions/$slug"
printf '{"imports":{}}\n' > "$dir/deno.json"
smoke(){
 local code
 code="$(curl -sS --max-time 30 -o "$work/response.json" -w '%{http_code}' -X POST -H "Origin: $origin" -H 'Authorization: Bearer invalid' "$url")" || return 1
 [[ "$code" == 503 ]] && node -e 'const x=require(process.argv[1]);if(x.error!=="ADMIN_PILOT_DISABLED")process.exit(1)' "$work/response.json" || return 1
 code="$(curl -sS --max-time 30 -o "$work/response.json" -w '%{http_code}' -X POST -H 'Origin: https://invalid.example' -H 'Authorization: Bearer invalid' "$url")" || return 1
 [[ "$code" == 403 ]] && node -e 'const x=require(process.argv[1]);if(x.error!=="FORBIDDEN")process.exit(1)' "$work/response.json" || return 1
 code="$(curl -sS --max-time 30 -o "$work/response.json" -w '%{http_code}' -X OPTIONS -H "Origin: $origin" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization' "$url")" || return 1
 [[ "$code" == 204 ]] || return 1
 code="$(curl -sS --max-time 30 -o "$work/response.json" -w '%{http_code}' -H "Origin: $origin" "$url")" || return 1
 [[ "$code" == 405 ]] && node -e 'const x=require(process.argv[1]);if(x.error!=="METHOD_NOT_ALLOWED")process.exit(1)' "$work/response.json" || return 1
 echo 'PASS: hosted OFF, wrong origin, OPTIONS and GET'
}
verify_flag(){
 local expected
 expected="$(printf false | sha256sum | cut -d' ' -f1)"
 # CLI table contains digests; never print secret inventory.
 "$cli" secrets list "$list_target" -o json | node --input-type=module -e '
 import {readFileSync} from "node:fs";
 const rows=JSON.parse(readFileSync(0,"utf8"));
 if(!Array.isArray(rows))process.exit(1);
 const matches=rows.filter(x=>x.name===process.argv[1]);
 if(matches.length!==1||(matches[0].digest??matches[0].value)!==process.argv[2])process.exit(1);
 ' "$flag" "$expected"
}
stage(){
 local kind="$1"
 [[ "$kind" == candidate || "$kind" == quarantine ]] || return 2
 rm -f -- "$dir/candidate.mjs" "$dir/quarantine.mjs"
 cp "$bundle/$kind.mjs" "$dir/$kind.mjs"
 printf "import './%s.mjs'\n" "$kind" > "$dir/index.ts"
 local expected=15b8a73a654bc2029db647f6de04d82f34ccc092a51d8c4c6e987c8ac8b24701
 [[ "$kind" == candidate ]] || expected=7cd9f42f30ed49e66d2af563147a0d44ed24235834cfa62a7f1fce1757891b90
 printf '%s  %s\n' "$expected" "$dir/$kind.mjs" | sha256sum -c -
}
deploy(){
 "$cli" functions deploy "$slug" "$deploy_target" --use-api --no-verify-jwt --import-map "$dir/deno.json" --yes
}
# Check currently hosted behavior before the one named flag change.
smoke
read -r -p 'Set only admin pilot flag false and deploy verified candidate OFF? Type DEPLOY OFF: ' answer
[[ "$answer" == 'DEPLOY OFF' ]] || { echo CANCELLED; exit 2; }
"$cli" secrets set "$flag=false" "$set_target" --yes
verify_flag || { echo OFF_DIGEST_NOT_VERIFIED_STOP; exit 2; }
echo 'PASS: explicit OFF secret digest verified'
smoke
stage candidate
# On an uncertain candidate deployment result or failed smoke, restore hard OFF once.
if ! deploy || ! smoke || ! verify_flag; then
 echo CANDIDATE_NOT_VERIFIED_RESTORING_QUARANTINE
 stage quarantine && deploy && smoke || { echo QUARANTINE_ROLLBACK_NOT_VERIFIED_STOP; exit 3; }
 echo QUARANTINE_RESTORED_STOP
 exit 2
fi
echo 'SUCCESS: candidate deployed OFF; hosted smoke passed; hosted source verification still required'
echo 'No Firestore rules, IAM, billing, operational records or spreadsheet changes requested.'
