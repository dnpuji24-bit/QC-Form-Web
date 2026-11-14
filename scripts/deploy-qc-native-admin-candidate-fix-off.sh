#!/usr/bin/env bash
# Stage 19F-C2C3D9. The default path verifies the restored quarantine read-only.
set +x
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
repo="$PWD"

unset SUPABASE_WORKDIR

[[ "$(git branch --show-current)" == "feature/firebase-auth-claims-supabase" ]] || {
  echo WRONG_BRANCH
  exit 2
}
apply=false
if [[ "${1:-}" == --deploy-off ]]; then
 apply=true
 shift
fi
[[ "$#" == 2 ]] || { echo 'USAGE: deploy-qc-native-admin-candidate-fix-off.sh [--deploy-off] BUNDLE_DIR BACKUP_DIR'; exit 2; }
if $apply && [[ ! -t 0 || ! -t 1 ]]; then echo INTERACTIVE_ONLY; exit 2; fi

ref=mcfwnstdfhhtcbksgrlj
slug=qc-native-admin-live-pilot
flag=QC_NATIVE_ADMIN_LIVE_PILOT_ENABLED
origin=https://form-qc-unm--react-test-ayyxz4hj.web.app
url="https://$ref.supabase.co/functions/v1/$slug"
candidate_hash=36c29d0770fde1a2f692045409d424a109f0b3da1648400ba49f015feb859bc8
quarantine_hash=7cd9f42f30ed49e66d2af563147a0d44ed24235834cfa62a7f1fce1757891b90
reviewed=fdfb37f8aa4530184dee8df7d2bc754503588d87
paths=(scripts/verify-qc-native-admin-candidate-fix.sh scripts/prepare-qc-native-admin-pilot-release.mjs scripts/cleanup-qc-native-admin-pilot.mjs scripts/firestore.legacy-audit-release.rules scripts/test-qc-native-admin-live-pilot.mjs scripts/run-qc-native-admin-transaction.mjs)
git merge-base --is-ancestor "$reviewed" HEAD
git diff --exit-code "$reviewed" -- "${paths[@]}"
bash scripts/verify-qc-native-admin-candidate-fix.sh "$1" "$2"

cli="$(command -v supabase)"
"$cli" --version
target_args(){
 if [[ "$1" == *--project-ref* ]]; then printf '%s\n' "--project-ref=$ref"
 elif [[ "$1" == *--remote* ]]; then printf '%s\n' "--remote=$ref"
 else echo CLI_EXPLICIT_TARGET_REQUIRED >&2; return 2; fi
}
list_target="$(target_args "$("$cli" functions list --help)")"
secret_target="$(target_args "$("$cli" secrets list --help)")"
download_help="$("$cli" functions download --help)"
download_target="$(target_args "$download_help")"
[[ "$download_help" == *--use-api* ]] || { echo CLI_DOWNLOAD_API_REQUIRED; exit 2; }
if $apply; then
 deploy_help="$("$cli" functions deploy --help)"
 deploy_target="$(target_args "$deploy_help")"
 [[ "$deploy_help" == *--use-api* && "$deploy_help" == *--no-verify-jwt* && "$deploy_help" == *--import-map* ]] || { echo CLI_DEPLOY_FLAGS_UNSUPPORTED; exit 2; }
fi
work="$(mktemp -d "$HOME/qc-migration-private/admin-corrected-off-XXXXXX")"
echo "Private verification workspace: $work"

stage(){
 local kind="$1" source="$2" digest="$3" dir="$work/$1/supabase/functions/$slug"
 mkdir -p "$dir"
 if $apply; then "$cli" init --workdir "$work/$kind"; fi
 cp -- "$source" "$dir/$kind.mjs"
 printf '%s  %s\n' "$digest" "$dir/$kind.mjs" | sha256sum -c -
 printf "import './%s.mjs'\n" "$kind" > "$dir/index.ts"
 printf '{"imports":{}}\n' > "$dir/deno.json"
}
stage candidate "$1/candidate.mjs" "$candidate_hash"
stage quarantine "$repo/scripts/release-artifacts/$slug/quarantine.mjs" "$quarantine_hash"

verify_flag(){
 local expected
 expected="$(printf false | sha256sum | cut -d' ' -f1)"
 "$cli" secrets list "$secret_target" -o json | node --input-type=module -e '
 import {readFileSync} from "node:fs";
 const rows=JSON.parse(readFileSync(0,"utf8"));
 const matches=rows.filter(x=>x.name===process.argv[1]);
 if(matches.length!==1||(matches[0].digest??matches[0].value)!==process.argv[2])process.exit(1);
 ' "$flag" "$expected"
}

attest_hosted(){
 node scripts/qc-native-admin-hosted-snapshot.mjs "$cli" "$list_target" "$download_target" "$work" "$1"
}

fresh_audit(){
 node scripts/prepare-qc-native-admin-pilot-release.mjs --read-only-confirmed
}

deploy(){
 local kind="$1" dir="$work/$1/supabase/functions/$slug"
 node scripts/qc-native-admin-hosted-snapshot.mjs --verify-source "$dir" "$kind" || return 1
 "$cli" functions deploy "$slug" "$deploy_target" --use-api --no-verify-jwt --import-map "$dir/deno.json" --workdir "$work/$kind" --yes
}

probe(){
 local method="$1" request_origin="$2" status="$3" error="$4" code
 shift 4
 code="$(curl -q -sS --max-time 30 -o "$work/response.json" -w '%{http_code}' \
  -X "$method" -H "Origin: $request_origin" "$@" "$url")" || return 1
 [[ "$code" == "$status" ]] || return 1
 [[ -z "$error" ]] || node -e 'if(require(process.argv[1]).error!==process.argv[2])process.exit(1)' "$work/response.json" "$error"
}

smoke(){
 probe POST "$origin" 503 ADMIN_PILOT_DISABLED -H 'Authorization: Bearer invalid' &&
 probe POST https://invalid.example 403 FORBIDDEN -H 'Authorization: Bearer invalid' &&
 probe OPTIONS "$origin" 204 '' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization' &&
 probe GET "$origin" 405 METHOD_NOT_ALLOWED &&
 echo 'PASS: hosted OFF, wrong origin, OPTIONS and GET'
}

attest_hosted quarantine
verify_flag
echo 'PASS: explicit OFF secret digest'
smoke
fresh_audit
if ! $apply; then
 echo 'SUCCESS: read-only corrected OFF preflight'
 exit 0
fi

read -r -p 'Confirm exclusive deployment access and deploy the corrected candidate OFF. Type DEPLOY CORRECTED OFF: ' answer
[[ "$answer" == 'DEPLOY CORRECTED OFF' ]] || { echo CANCELLED; exit 2; }
fresh_audit
smoke
verify_flag
attest_hosted quarantine

rollback(){
 trap - EXIT
 trap '' INT TERM HUP
 echo CANDIDATE_NOT_VERIFIED_RESTORING_ORIGINAL_QUARANTINE
 local off=unverified action
 if verify_flag; then off=off-verified; fi
 action="$(node scripts/qc-native-admin-hosted-snapshot.mjs "$cli" "$list_target" "$download_target" "$work" rollback "$off")" || action=stop
 if [[ "$action" == already-quarantine ]]; then
  echo QUARANTINE_ALREADY_PRESENT
 elif [[ "$action" == restore-quarantine ]]; then
  deploy quarantine || echo QUARANTINE_DEPLOY_RESULT_UNCERTAIN
 else
  echo HOSTED_DRIFT_OR_OFF_UNVERIFIED_NO_OVERWRITE
 fi
 if attest_hosted quarantine && smoke && verify_flag; then
  echo QUARANTINE_RESTORED_DO_NOT_RETRY
  exit 2
 fi
 echo "ROLLBACK_NOT_VERIFIED_STOP: $work"
 exit 3
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
deploy candidate
attest_hosted candidate
smoke
verify_flag
trap - EXIT INT TERM HUP
echo 'SUCCESS: corrected candidate deployed OFF; hosted source, smoke and flag verified'
