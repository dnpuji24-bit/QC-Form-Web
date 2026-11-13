#!/usr/bin/env bash
# Read-only Cloud Run prerequisite inventory. Never enables APIs, billing or IAM.
set -euo pipefail
PROJECT=form-qc-unm
[[ $# == 1 && "$1" == --read-only-confirmed ]] || { echo 'USAGE: --read-only-confirmed'; exit 2; }
command -v gcloud >/dev/null
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
ACTIVE=$(gcloud config get-value project 2>/dev/null)
[[ "$ACTIVE" == "$PROJECT" ]] || { echo 'WRONG_ACTIVE_PROJECT'; exit 2; }
echo "Project: $PROJECT"
probe() {
  local label="$1"; shift
  echo "--- $label ---"
  if ! "$@" 2>/dev/null; then echo 'UNAVAILABLE_OR_PERMISSION_DENIED'; fi
}
probe "Billing enabled (boolean only)" gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' --quiet
probe "Firestore database location" gcloud firestore databases describe --database='(default)' --project="$PROJECT" --format='value(locationId)' --quiet
echo "--- Enabled deployment APIs ---"
if ENABLED=$(gcloud services list --enabled --project="$PROJECT" --format='value(config.name)' --quiet 2>/dev/null); then
  for api in run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com identitytoolkit.googleapis.com firestore.googleapis.com secretmanager.googleapis.com; do
    if grep -Fxq "$api" <<<"$ENABLED"; then printf '%s: ENABLED\n' "$api"; else printf '%s: NOT_ENABLED\n' "$api"; fi
  done
else echo 'UNAVAILABLE_OR_PERMISSION_DENIED'; fi
if grep -Fxq run.googleapis.com <<<"${ENABLED:-}"; then
  probe "Cloud Run services (name and region only; configured region if set)" gcloud run services list --project="$PROJECT" --format='table(metadata.name,metadata.labels."cloud.googleapis.com/location")' --quiet
else echo 'Cloud Run list skipped: API not confirmed enabled'; fi
if grep -Fxq artifactregistry.googleapis.com <<<"${ENABLED:-}"; then
  probe "Artifact Registry repositories (name and location only)" gcloud artifacts repositories list --project="$PROJECT" --location=all --format='table(name,format)' --quiet
else echo 'Artifact Registry list skipped: API not confirmed enabled'; fi
if grep -Fxq iam.googleapis.com <<<"${ENABLED:-}"; then
  probe "Dedicated QC service accounts (names only)" gcloud iam service-accounts list --project="$PROJECT" --filter='email:qc-' --format='table(email,disabled)' --quiet
else echo 'IAM list skipped: API not confirmed enabled'; fi
echo 'SUCCESS: Cloud runtime inventory attempted; unavailable probes require review'
echo 'No APIs enabled, no billing changes, no IAM changes, no deployments'
