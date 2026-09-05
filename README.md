# Reelforge

Reelforge is a React Native + Expo app that automates AI-narrated short-story videos for YouTube.

## Run locally

```bash
npm install
npx expo start
```

- Press `w` for the web build.
- Scan the QR code with the Expo Go app (iOS/Android) for mobile.
- Press `a` or `i` for Android/iOS simulators.

## Build the web export

```bash
npx expo export --platform web
```

This produces a static `dist/` directory.

## Deploy to Vercel

1. Connect this GitHub repo to a Vercel project.
2. Vercel detects `vercel.json`:
   - **Build command:** `npx expo export --platform web`
   - **Output directory:** `dist`
   - **SPA rewrites:** all paths fall back to `index.html` for client-side routing.
3. Add the Firebase client environment variables in **Vercel → Project Settings → Environment Variables**.

### Environment variables — Vercel (client-safe)

These values are safe to expose in the client bundle. Firebase treats them as public client config:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID`
- `REELFORGE_SEED_MOCK_PROJECTS` — set to `false` in production to stop seeding mock projects on first login.

### Server-only secrets (never add to Vercel)

- Provider API keys (Anthropic, ElevenLabs, fal.ai, Sync Labs) are stored in Google Secret Manager via `saveApiKey`.
- YouTube OAuth client secret (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`) and user refresh tokens are stored in Cloud Functions / Secret Manager only.
- The `GCP_SA_KEY` and `FIREBASE_TOKEN` used by the GitHub Actions deployment workflow are repository secrets, not Vercel variables.

## Firebase & Cloud Run setup

- Deploy Cloud Functions from the `functions/` directory: `cd functions && npm run deploy`.
- Deploy the Cloud Run stitch / YouTube upload service by adding `GCP_SA_KEY` and `FIREBASE_TOKEN` as GitHub repository secrets, then pushing to `main` or running the `Deploy Stitch Service to Cloud Run` workflow manually.
- The `reelforge-pipeline` and `reelforge-secrets-manager` service accounts need the least-privilege roles listed in `PHASE3_REPORT.md`.

## Tech stack

- React Native + Expo (managed workflow)
- TypeScript (strict mode)
- React Navigation
- NativeWind / Tailwind CSS
- Zustand
- Firebase Auth, Firestore, Cloud Functions, Cloud Messaging, Storage, Secret Manager
- Cloud Run (ffmpeg stitching + YouTube upload)
- Anthropic Claude, ElevenLabs, fal.ai, Sync Labs, YouTube Data API
