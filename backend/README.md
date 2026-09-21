# HabitQuest OAuth backend

Small Google Cloud Run service used only to keep Google Sheets authorization alive across iPhone/iPad PWA restarts.

## What it stores

The browser receives a random opaque session token. The Google refresh token is stored server-side in Firestore and is never committed to GitHub or returned to the browser.

## Required Google Cloud services

- Cloud Run
- Cloud Build
- Artifact Registry
- Firestore (Native mode)

The Cloud Run runtime service account needs permission to read/write Firestore.

## Environment variables

- `GOOGLE_CLIENT_ID`: HabitQuest OAuth web client ID
- `GOOGLE_CLIENT_SECRET`: corresponding OAuth client secret
- `FRONTEND_ORIGIN`: `https://mamg97.github.io`

Never commit the client secret.

## Deploy

From Google Cloud Shell with the HabitQuest project selected:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com

gcloud run deploy habitquest-oauth \
  --source backend \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars FRONTEND_ORIGIN=https://mamg97.github.io,GOOGLE_CLIENT_ID=YOUR_CLIENT_ID \
  --set-secrets GOOGLE_CLIENT_SECRET=habitquest-google-client-secret:latest
```

Create the Secret Manager secret `habitquest-google-client-secret` before deployment and grant the Cloud Run runtime service account access to it.

After Cloud Run returns the HTTPS service URL, configure that URL in the HabitQuest frontend. Until then the current browser-token flow remains active.
