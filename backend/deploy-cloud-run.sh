#!/usr/bin/env bash
set -euo pipefail

CLIENT_ID="137310587054-pvtskadkd7gpgm2r1024i10hmi9qapcs.apps.googleusercontent.com"
FRONTEND_ORIGIN="https://mamg97.github.io"
REGION="${REGION:-europe-west1}"
SERVICE="habitquest-oauth"
SERVICE_ACCOUNT="habitquest-oauth-runtime"
SECRET_NAME="habitquest-google-client-secret"

PROJECT_ID="$(gcloud config get-value project 2>/dev/null)"
if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "No Google Cloud project is selected."
  echo "Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

echo "Project: $PROJECT_ID"
echo "Region:  $REGION"

read -rsp "Paste the HabitQuest OAuth client secret (input hidden): " CLIENT_SECRET
echo
if [[ -z "$CLIENT_SECRET" ]]; then
  echo "Client secret cannot be empty."
  exit 1
fi

gcloud services enable   run.googleapis.com   cloudbuild.googleapis.com   artifactregistry.googleapis.com   firestore.googleapis.com   secretmanager.googleapis.com

if ! gcloud iam service-accounts describe   "$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SERVICE_ACCOUNT"     --display-name="HabitQuest OAuth runtime"
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID"   --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com"   --role="roles/datastore.user"   --quiet >/dev/null

if ! gcloud secrets describe "$SECRET_NAME" >/dev/null 2>&1; then
  printf '%s' "$CLIENT_SECRET" | gcloud secrets create "$SECRET_NAME"     --replication-policy="automatic"     --data-file=-
else
  printf '%s' "$CLIENT_SECRET" | gcloud secrets versions add "$SECRET_NAME"     --data-file=-
fi
unset CLIENT_SECRET

gcloud secrets add-iam-policy-binding "$SECRET_NAME"   --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com"   --role="roles/secretmanager.secretAccessor"   --quiet >/dev/null

if ! gcloud firestore databases describe --database="(default)" >/dev/null 2>&1; then
  echo
  echo "Firestore database (default) does not exist yet."
  echo "Create it once in Google Cloud Console as Firestore Native mode, then run this script again."
  exit 2
fi

gcloud run deploy "$SERVICE"   --source backend   --region "$REGION"   --allow-unauthenticated   --service-account="$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com"   --set-env-vars="FRONTEND_ORIGIN=$FRONTEND_ORIGIN,GOOGLE_CLIENT_ID=$CLIENT_ID"   --set-secrets="GOOGLE_CLIENT_SECRET=$SECRET_NAME:latest"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"

echo
echo "HabitQuest OAuth backend deployed:"
echo "$URL"
echo
echo "Send only this Cloud Run URL back to ChatGPT. Do not send the client secret."
