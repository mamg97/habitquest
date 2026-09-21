# HabitQuest OAuth Worker

Free, stateless OAuth helper for HabitQuest.

It keeps the Google refresh token encrypted inside an opaque session token using AES-GCM. The browser never receives the refresh token in plaintext. No database is required.

## Free tier

Cloudflare Workers Free is sufficient for HabitQuest's expected personal usage.

## Setup

1. Create a free Cloudflare account.
2. In a terminal:

```bash
cd worker
npm install
npx wrangler login
```

3. Set secrets:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
```

For `GOOGLE_CLIENT_SECRET`, paste the secret from the HabitQuest OAuth client JSON.

For `SESSION_SECRET`, use a long random value. For example:

```bash
openssl rand -base64 48
```

4. Deploy:

```bash
npm run deploy
```

Wrangler prints the public Worker URL, for example:

`https://habitquest-oauth.<your-subdomain>.workers.dev`

5. In Google Cloud → HabitQuest → OAuth client `HabitQuest GitHub Pages`, add this authorized redirect URI:

`https://habitquest-oauth.<your-subdomain>.workers.dev/oauth/callback`

6. Send only the Worker base URL back to ChatGPT. Never send the client secret or session secret.
