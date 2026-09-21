# HabitQuest

> Migration status and technical history: see [MIGRATION.md](./MIGRATION.md).

HabitQuest is a personal, mobile-first habit tracker with XP, levels, streaks, achievements, history and Google Sheets synchronization.

## Architecture

- React + TypeScript + Vite
- TanStack Router with hash history, compatible with GitHub Pages
- Local browser cache through `localStorage`
- Google Sheets as the cross-device source of truth
- Direct Google Sheets API access from the browser using Google Identity Services
- XLSX import/export
- GitHub Actions deployment to GitHub Pages

## Data safety

HabitQuest never deletes a Google Sheet when you disconnect it from the app.

When a browser links an existing spreadsheet, the application reads the remote data before any write. A fresh browser starts without demo habits, so sample data cannot be merged into the real history by accident.

The app also blocks attempts to overwrite a linked spreadsheet with a completely empty state.

The expected workbook structure is:

- `Habits`
- `History`
- `Meta`

The existing workbook format is preserved, so no data migration inside the spreadsheet is required.

## Google Sheets setup

HabitQuest uses a Google OAuth **Web application client ID**. The client ID is public configuration, not a client secret.

1. In Google Cloud, create or select a project.
2. Enable the Google Sheets API.
3. Configure the OAuth consent screen for your Google account.
4. Create an OAuth 2.0 Client ID of type **Web application**.
5. Add the GitHub Pages origin as an authorized JavaScript origin:
   - `https://mamg97.github.io`
6. For local development, you may also add:
   - `http://localhost:5173`
7. Open HabitQuest, go to **Profile → Google Sheets sync**, paste the OAuth client ID and connect Google.
8. Paste the URL of the existing HabitQuest spreadsheet. The app reads it before writing anything.

No Google client secret belongs in this repository.

## Local development

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/mamg97/habitquest.git
cd habitquest
npm install
npm run dev
```

To verify the production build:

```bash
npm run build
npm run typecheck
npm run preview
```

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` validates and deploys `main` to GitHub Pages.

The Vite build uses relative asset paths and hash-based routing, so the app works under the repository Pages path.

Public URL:

`https://mamg97.github.io/habitquest/`

## Ownership

The application runs from this repository, GitHub Pages and the user's own Google Sheet. No paid hosting service or separate application server is required.
