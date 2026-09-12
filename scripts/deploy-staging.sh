#!/usr/bin/env bash
# Deploy the current working tree to the STAGING Amplify app.
#
#   ./scripts/deploy-staging.sh
#
# Staging lives in AWS account 389339912710 (app dqnh44mdognyi) and is a
# manual-deploy app — no GitHub connection, so this script uploads a zip
# directly. Production (jadara-aladaa.sa) is a DIFFERENT AWS account and is
# never touched by this script; it still deploys only via push to `main`.
#
# The staging site talks to the staging Supabase project, selected at runtime
# by hostname (see admin/js/modules/supabase-client.js STAGING_HOSTS), so
# nothing here can write to live data.
set -euo pipefail

APP_ID="dqnh44mdognyi"
BRANCH="staging"
REGION="us-east-1"
URL="https://${BRANCH}.${APP_ID}.amplifyapp.com"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Only the files the site actually serves — no .git, supabase/, docs/, .claude/.
cd "$ROOT"
mkdir -p "$WORK/site"
cp -r index.html privacy-policy.html admin css js assets fonts Clients_logos \
      favicon-16x16.png favicon-light.svg favicon.ico favicon.svg jadara_logo.png \
      "$WORK/site/"

# Built with python, NOT PowerShell's Compress-Archive: on Windows PowerShell
# 5.1 that writes backslash path separators, which Amplify does not read as
# directories — every subfolder 404s while the root still serves.
python -c "
import os, zipfile, sys
root, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, _, files in os.walk(root):
        for f in files:
            full = os.path.join(dirpath, f)
            z.write(full, os.path.relpath(full, root).replace(os.sep, '/'))
" "$WORK/site" "$WORK/site.zip"

aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" \
    --region "$REGION" --output json > "$WORK/dep.json"
JOB_ID=$(python -c "import json,sys;print(json.load(open(sys.argv[1]))['jobId'])" "$WORK/dep.json")
UPLOAD=$(python -c "import json,sys;print(json.load(open(sys.argv[1]))['zipUploadUrl'])" "$WORK/dep.json")

curl -sS -X PUT --upload-file "$WORK/site.zip" "$UPLOAD" -o /dev/null
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" \
    --job-id "$JOB_ID" --region "$REGION" --output text --query 'jobSummary.status' > /dev/null

echo "deploying job $JOB_ID..."
until [ "$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" \
          --job-id "$JOB_ID" --region "$REGION" \
          --query 'job.summary.status' --output text)" = "SUCCEED" ]; do
  sleep 5
done
echo "staging deployed: $URL"
