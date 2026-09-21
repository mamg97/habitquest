# HabitQuest — Migration Log

**Last updated:** 2026-09-21  
**Repository:** `mamg97/habitquest`  
**Status:** migration active; frontend is already live on GitHub Pages, persistent Google OAuth via Cloudflare Worker is being completed.

---

## 1. Goal

Migrate HabitQuest away from Lovable so the application is fully controlled by the owner, while preserving the existing Google Sheet as the source of truth.

Primary goals:

- Remove Lovable runtime dependencies and branding.
- Move the app to a clean personal GitHub repository.
- Host the frontend on GitHub Pages.
- Preserve the existing Google Sheet and all historical data.
- Keep iPhone/iPad PWA usage working.
- Keep Google Sheets synchronization working across devices.
- Avoid paid hosting if possible.
- Keep secrets out of GitHub and out of the browser whenever possible.

---

## 2. Existing data source

The existing Google Sheet is the authoritative data store and must **not** be deleted or replaced.

**Spreadsheet title:** `HabitQuest Data`  
**Spreadsheet ID:** `1v_yDn50Pw2t0mcyphHispJ4vSsKVS8Z4oLSgUuxisUA`

Expected sheets:

- `Habits`
- `History`
- `Meta`

The migrated app keeps this structure compatible with the previous version.

### Data-safety rules

- Never delete the original spreadsheet as part of the migration.
- Never overwrite the spreadsheet with an empty local state.
- On a fresh browser/device, read the remote spreadsheet before writing.
- Do not seed demo/sample habits into a fresh production installation.
- Unlinking Google Sheets from a device must never delete the spreadsheet.

---

## 3. Backups created

Before destructive migration work:

### Git backup

Old repository retained:

`mamg97/mindful-missions-play`

Important backup branches:

- `backup/pre-lovable-removal-2026-09-21`
- `release/habitquest-clean`

The old repository has **not** been deleted.

### Google Sheet backup

A separate backup copy was created:

`HabitQuest Data — backup pre-migration 2026-09-21`

The production spreadsheet remains the original `HabitQuest Data`.

---

## 4. New clean repository

A new repository was created:

`mamg97/habitquest`

Reason:

The original repository contained historical Lovable commits. A new repository was preferred so the active project could have a clean history and no operational Lovable dependency.

The clean source snapshot was copied into the new repository and validated.

Current public frontend:

`https://mamg97.github.io/habitquest/`

---

## 5. Frontend migration completed

HabitQuest was converted to a static SPA/PWA suitable for GitHub Pages.

### Current frontend stack

- React
- TypeScript
- Vite
- TanStack Router
- Hash-based routing for GitHub Pages compatibility
- localStorage as local device cache
- Google Sheets as cross-device source of truth
- XLSX import/export
- GitHub Actions deployment

### GitHub Pages

GitHub Pages is enabled with:

`Settings → Pages → Source → GitHub Actions`

The deployment workflow:

`.github/workflows/deploy.yml`

Validates:

- dependency installation
- production build
- strict TypeScript check
- OAuth Worker syntax
- GitHub Pages artifact
- deployment

---

## 6. Lovable / Supabase removal

The clean repository removed the previous runtime coupling to:

- Lovable
- Lovable Cloud
- `@lovable.dev/*`
- Lovable connector gateway
- Lovable app-user connector
- Supabase authentication
- Supabase server runtime
- TanStack Start server functions
- Nitro/server runtime
- tracked legacy `.env`
- Lovable OAuth callback route
- legacy server-side Google Sheets sync code

The active repository currently has no operational dependency on Lovable.

---

## 7. Google Sheets migration

The original Google Sheet remains in place.

HabitQuest currently has the production spreadsheet preconfigured so a fresh device does not need to paste the Sheet URL manually.

The app:

1. connects to Google;
2. reads the existing spreadsheet;
3. merges remote/local state safely;
4. only writes after the remote state has been read;
5. blocks an empty-state overwrite.

---

## 8. Google OAuth project

Google Cloud project reused:

**Project name:** `HabitQuest`  
**Project ID:** `habitquest-505817`

Google Sheets API is enabled.

A new OAuth 2.0 client was created specifically for the independent GitHub Pages app.

**OAuth client type:** Web application  
**OAuth client name:** HabitQuest GitHub Pages  
**Client ID:**

`137310587054-pvtskadkd7gpgm2r1024i10hmi9qapcs.apps.googleusercontent.com`

Authorized JavaScript origin:

`https://mamg97.github.io`

### Security

The OAuth `client_id` is public configuration and can exist in frontend source.

The OAuth `client_secret` must **never** be committed to GitHub.

The downloaded Google OAuth JSON currently exists only on the owner's local Mac.

---

## 9. Temporary browser-token solution

The first independent Google Sheets implementation used Google Identity Services directly in the browser.

The initial implementation kept the access token only in memory.

Problem observed on iPhone/iPad:

- iOS suspends/kills the PWA;
- in-memory token disappears;
- app still shows the Sheet as `Linked`;
- Google session appears disconnected;
- user has to press `Connect Google` again.

A temporary improvement was added:

- access token is stored locally until its real expiry;
- token is restored after PWA restart/resume;
- app resynchronizes on focus/visibility changes;
- forced `prompt=consent` was removed.

This improves short-term PWA restarts, but access tokens still expire periodically.

---

## 10. Why persistent OAuth needs a server-side component

Google access tokens are short-lived.

To avoid asking the user to log in every time an access token expires, HabitQuest needs a Google **refresh token**.

A refresh token must not be embedded in public frontend JavaScript.

Therefore the long-lived OAuth session requires a tiny trusted server-side component.

---

## 11. Cloud Run attempt — abandoned

A Google Cloud Run backend was prepared first.

Files were temporarily added under:

`backend/`

The deployment was attempted from Google Cloud Shell.

Deployment stopped because Google Cloud required a billing account to enable:

- Cloud Run
- Cloud Build
- Artifact Registry
- Secret Manager

The project had no billing account attached.

### Important

The deployment stopped before a production Cloud Run service was created.

The obsolete `backend/` implementation was subsequently removed from the repository.

Cloud Run is **not** part of the current architecture.

---

## 12. Current persistent-session solution: Cloudflare Worker

To keep the solution free, the persistent OAuth backend was redesigned as a Cloudflare Worker.

Current directory:

`worker/`

Files:

- `worker/package.json`
- `worker/wrangler.toml`
- `worker/src/index.js`
- `worker/README.md`

### Current design

Architecture:

`iPhone/iPad PWA → GitHub Pages → Cloudflare Worker → Google OAuth / Google Sheets`

The Worker:

- performs Google Authorization Code flow;
- requests `access_type=offline`;
- receives the Google refresh token server-side;
- never sends the refresh token to the frontend in plaintext;
- encrypts the refresh token into an opaque session token;
- uses AES-GCM;
- signs OAuth state;
- accepts requests only from `https://mamg97.github.io`;
- can exchange the encrypted session for fresh Google access tokens;
- can revoke/delete the session.

### Session duration

Current configured application session:

`90 days`

This can be changed later.

No database is required for the current stateless design.

---

## 13. Cloudflare secrets

The Worker needs two secrets:

### GOOGLE_CLIENT_SECRET

The secret belonging to the Google OAuth client.

It must be entered directly into Cloudflare/Wrangler.

Never paste it into ChatGPT.

Never commit it to GitHub.

### SESSION_SECRET

A long random secret used to encrypt/sign the opaque session token.

Generate with something similar to:

`openssl rand -base64 48`

This secret also belongs only in Cloudflare.

---

## 14. Current Cloudflare status

A free Cloudflare account has been created.

An attempt to use:

`npx wrangler login`

from Google Cloud Shell timed out because Wrangler's OAuth callback expected:

`localhost:8976`

inside Cloud Shell.

Therefore the deployment is switching to a Cloudflare API Token.

Current manual step:

Create a **minimal custom Cloudflare API Token** for the personal Cloudflare account.

Recommended permissions:

- Account → Workers Scripts → Edit
- Account → Account Settings → Read

No DNS/Zone permissions are required for the HabitQuest Worker.

Avoid the broad `Edit Cloudflare Workers` template if possible because it grants unnecessary permissions such as KV, R2, Pages, Tail, Routes and Containers.

---

## 15. Current exact pending steps

### Step A — Create minimal Cloudflare API token

In Cloudflare:

`Profile → API Tokens → Create Token → Custom token`

Use only:

- Workers Scripts: Edit
- Account Settings: Read
- Account Resources: the owner's Cloudflare account

No IP restriction required.

No expiry required unless deliberately desired.

Do **not** send the API token to ChatGPT.

### Step B — Authenticate Wrangler from Google Cloud Shell

In Google Cloud Shell:

```bash
export CLOUDFLARE_API_TOKEN='PASTE_TOKEN_HERE'
cd ~/habitquest/worker
npx wrangler whoami
```

### Step C — Configure Worker secrets

Still in Cloud Shell:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Paste the Google OAuth client secret when prompted.

Then generate a session secret locally in Cloud Shell:

```bash
openssl rand -base64 48
```

Copy that value and run:

```bash
npx wrangler secret put SESSION_SECRET
```

Paste the generated value.

Neither secret should be sent to ChatGPT.

### Step D — Deploy Worker

```bash
npm run deploy
```

Expected result:

`https://habitquest-oauth.<subdomain>.workers.dev`

Only this public Worker URL should be sent back to ChatGPT.

### Step E — Add Google redirect URI

Once the Worker URL is known, add this to the Google OAuth web client:

`https://habitquest-oauth.<subdomain>.workers.dev/oauth/callback`

under:

`Google Cloud → HabitQuest → APIs & Services → Credentials → HabitQuest GitHub Pages → Authorized redirect URIs`

### Step F — Connect frontend to Worker

After the Worker URL exists:

- configure HabitQuest frontend to use the Worker;
- switch sign-in from short-lived browser-only token flow to Worker-backed persistent session;
- retain the direct browser-token path as a temporary fallback until validation is complete;
- build;
- typecheck;
- deploy through GitHub Pages.

### Step G — Validate on real devices

Test on:

- iPhone PWA
- iPad PWA
- desktop browser

Validation cases:

1. connect Google once;
2. verify existing habits/history load correctly;
3. complete a habit;
4. verify the Sheet updates;
5. close the PWA;
6. reopen after several minutes;
7. confirm no new Google login is required;
8. test after the original one-hour access-token lifetime;
9. confirm the Worker silently obtains a new access token;
10. verify cross-device updates still merge correctly.

---

## 16. Do not remove old credentials yet

Do **not** delete the legacy `Lovable` OAuth client yet.

Do not remove old backups yet.

Only clean up historical credentials after:

- Cloudflare Worker is deployed;
- persistent OAuth works;
- iPhone/iPad tests pass;
- Google Sheets sync is stable;
- historical data is verified.

---

## 17. Final cleanup after successful validation

Once the new system has been stable:

- delete/revoke the old Lovable OAuth credential;
- disconnect/revoke Lovable integrations if still present;
- optionally archive the old `mindful-missions-play` repository;
- retain at least one data backup;
- remove any obsolete temporary migration branches only after explicit confirmation.

---

## 18. Recovery plan

If the Worker migration fails:

1. do not touch the Google Sheet;
2. keep using the current GitHub Pages frontend;
3. reconnect Google manually through the current browser-token flow;
4. use XLSX export if desired as an extra backup;
5. revert the frontend to the last successful GitHub Actions deployment if needed.

The spreadsheet is always the critical asset and must remain untouched during infrastructure changes.

---

## 19. Project principles

- Google Sheet = source of truth.
- Never destroy historical data during infrastructure migration.
- Prefer free hosting where practical.
- Secrets never go into GitHub.
- New code must pass build and TypeScript validation.
- Infrastructure changes should be reversible.
- The migration log must be updated whenever architecture, credentials, hosting or sync behavior changes.


### Troubleshooting — Cloudflare API token

An initial Wrangler API-token test failed with:

`Invalid format for Authorization header [code: 6111]`

Cause:

The shell command was executed with the placeholder value:

`PEGA_AQUI_EL_TOKEN`

instead of the real Cloudflare API token.

Safe retry method that avoids showing the token on screen:

```bash
read -rsp "Cloudflare API token: " CLOUDFLARE_API_TOKEN
echo
export CLOUDFLARE_API_TOKEN
npx wrangler whoami
```

The actual Cloudflare API token must never be sent to ChatGPT or committed to GitHub.


### Cloudflare API token authentication — completed

Wrangler authentication from Google Cloud Shell now works using the `CLOUDFLARE_API_TOKEN` environment variable.

Verified command:

```bash
npx wrangler whoami
```

Result:

- authentication succeeded;
- Wrangler recognized the personal Cloudflare account;
- API token is being read from the environment variable;
- no browser OAuth callback is required anymore.

Next pending steps:

1. store `GOOGLE_CLIENT_SECRET` in Cloudflare Worker secrets;
2. generate and store `SESSION_SECRET`;
3. deploy the Worker;
4. capture the public `workers.dev` URL;
5. add the Worker OAuth callback URL to Google Cloud;
6. connect the HabitQuest frontend to the Worker;
7. validate persistent Google Sheets login on iPhone/iPad.


### Cloudflare Worker creation prompt

While running:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Wrangler reported that no Worker named `habitquest-oauth` existed yet and asked:

`Do you want to create a new Worker with that name and add secrets to it? (Y/n)`

This is expected on the first secret upload. The correct action is to answer `Y` (or press Enter, since Yes is the default) so Cloudflare creates the Worker and stores the secret there.


### Cloudflare Worker secrets — completed

The Cloudflare Worker `habitquest-oauth` has now been created.

The following secrets were successfully uploaded through Wrangler:

- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`

Both were entered directly into Cloudflare and are not stored in GitHub.

The session secret was generated in Cloud Shell with:

```bash
openssl rand -base64 48
```

and piped directly into Wrangler, so the generated value was not written to Git history.

Next step:

```bash
npm run deploy
```

After deployment, capture the public `workers.dev` URL and add its `/oauth/callback` endpoint to the Google OAuth client's authorized redirect URIs.


### workers.dev subdomain registration

The first Worker deployment successfully uploaded the `habitquest-oauth` script and then paused because the Cloudflare account did not yet have a `workers.dev` subdomain registered.

Wrangler prompted:

`Would you like to register a workers.dev subdomain now? (Y/n)`

Correct action:

- answer `Y` or press Enter;
- if Cloudflare asks for an account-wide `workers.dev` subdomain, choose a short stable value such as `mamg97`.

Expected Worker URL format:

`https://habitquest-oauth.<account-subdomain>.workers.dev`

After the final URL is issued, add:

`https://habitquest-oauth.<account-subdomain>.workers.dev/oauth/callback`

to the Google OAuth client's authorized redirect URIs.
