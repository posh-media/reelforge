# Reelforge — Final Report

## Project status

Reelforge is an Expo app that turns a short story idea into an AI-narrated video, then lets you review, download, and publish to YouTube. The full pipeline is implemented:

```
Idea → Claude breakdown → ElevenLabs voices → fal.ai video → Sync Labs lip-sync → Cloud Run stitch → Final review → Download / YouTube publish
```

All code is on `main` and the latest client/functions builds pass. The only remaining work is external deployment and live testing.

---

## What is implemented and deployed

| Area | Status | Evidence |
|------|--------|----------|
| Firebase Auth | ✅ | Email/password sign-in, protected routes |
| Firestore persistence | ✅ | Projects, scenes, API-key metadata, usage logs, FCM tokens |
| Storage rules | ✅ | Owner-only access, no raw secrets |
| Secret Manager API-key vault | ✅ | `saveApiKey` / `deleteApiKey` store keys per-user, never in Firestore |
| Anthropic breakdown | ✅ | `generateBreakdown` calls Claude, writes `script_ready` scenes |
| ElevenLabs voice | ✅ | `listVoices`, `generateSceneVoice` upload to Storage, set `voice_ready` |
| fal.ai video | ✅ | Webhook-primary (`falWebhook`) + `pollFalQueue` fallback, `video_ready` |
| Sync Labs lip-sync | ✅ | `generateSceneLipsync` uses `lipsync-2`, webhook + `pollSyncLabs` fallback |
| Cloud Run stitch | ✅ Code, not yet deployed | `stitch-service` `/stitch` endpoint; `stitchProject` callable wired but needs `STITCH_SERVICE_URL` |
| YouTube OAuth | ✅ | `youtubeAuthUrl` / `youtubeOAuthCallback`; refresh token stored in Secret Manager |
| AI metadata | ✅ | `generateVideoMetadata` + `PublishScreen` editable draft |
| YouTube upload | ✅ Code, not yet deployed | `stitch-service` `/upload` endpoint; `uploadToYoutube` callable; resumable upload + private-only downgrade |
| Downloads | ✅ | Per-scene and full-project download via `expo-file-system` / `expo-sharing` / web `<a>` |
| FCM push notifications | ✅ | Expo Go-compatible token registration; `sendPushToUser` on completion/failure |
| Retry classification | ✅ | `isTransientError` + one-time auto-retry in `doGenerateSceneVoice` / `Video` / `Lipsync` |
| Vercel web build | ✅ | `npx expo export --platform web` → `dist/`; `vercel.json` configured for SPA routing |
| Mock seeding | ✅ | `REELFORGE_SEED_MOCK_PROJECTS` defaults to `false` |
| `tsc --noEmit` | ✅ | Passes |
| `test:rules` | ✅ | 7/7 pass |
| `npm run build` (functions) | ✅ | Passes |
| `firebase deploy --only functions` | ✅ | All functions including `youtubeAuthUrl`, `youtubeOAuthCallback`, `generateVideoMetadata`, `uploadToYoutube` |

---

## What is still blocked / not yet live

1. **Cloud Run stitch service** — code is ready but not deployed because `gcloud`/`docker` are unavailable here. The GitHub Actions workflow is configured; it just needs repo secrets.
2. **`STITCH_SERVICE_URL` for `stitchProject` / `uploadToYoutube`** — set automatically by the workflow once the service is deployed.
3. **YouTube OAuth credentials** — `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` must be added to the GitHub secrets so the workflow can write them into `functions/.env`.
4. **YouTube OAuth verification** — Google OAuth consent screen needs to be switched to "In production" and submitted for verification. Until then, uploads will only succeed as `private`.
5. **Vercel deployment** — needs the Firebase client env vars and a fresh deploy after the `vercel.json` fix.
6. **Real end-to-end live test** — waiting on Cloud Run + real provider keys.
7. **Screenshots of the new flows** — voice picker, scene-by-scene modal, final review, Publish screen, download buttons.

---

## What you need to do next

### A. GitHub secrets (required for Cloud Run + YouTube)

Add these at **GitHub → repo → Settings → Secrets and variables → Actions**:

| Secret | How to get it |
|--------|---------------|
| `GCP_SA_KEY` | Create a `reelforge-github-actions` service account in GCP. Grant: `Cloud Build Editor`, `Cloud Run Admin`, `Service Account User` on `reelforge-pipeline`. Download the JSON key and paste it here. |
| `FIREBASE_TOKEN` | Run `npx firebase login:ci` and copy the token. |
| `YOUTUBE_CLIENT_ID` | From Google Cloud → APIs & Services → Credentials → your OAuth client. |
| `YOUTUBE_CLIENT_SECRET` | Same OAuth client secret. |

Also make sure `https://us-central1-reelforge-4b07d.cloudfunctions.net/youtubeOAuthCallback` is added as an **Authorized redirect URI** on that OAuth client.

### B. Trigger the Cloud Run workflow

- `git push origin main` — the workflow runs on `push` to `main` when `cloud-run/stitch-service/**` or the workflow file changes.
- Or: **GitHub → Actions → Deploy Stitch Service to Cloud Run → Run workflow**.

After it finishes, `STITCH_SERVICE_URL` is written to `functions/.env` and functions are redeployed automatically.

### C. Vercel deployment

1. Connect the GitHub repo to Vercel.
2. Vercel will pick up `vercel.json`: build command `npx expo export --platform web`, output `dist`, SPA fallback to `index.html`.
3. Add these env vars (client-safe, from `.env`):

```bash
FIREBASE_API_KEY=AIzaSyCNBmwXddeMpw54X39Zk56WsDZZCp4LlF4
FIREBASE_AUTH_DOMAIN=reelforge-4b07d.firebaseapp.com
FIREBASE_PROJECT_ID=reelforge-4b07d
FIREBASE_STORAGE_BUCKET=reelforge-4b07d.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=231197101583
FIREBASE_APP_ID=1:231197101583:web:84384738cf6a1cf9708f91
FIREBASE_MEASUREMENT_ID=G-YQMTBZ4YTZ
REELFORGE_SEED_MOCK_PROJECTS=false
```

4. Redeploy after the `vercel.json` fix (the old `rewrites` version could cause file-download behavior).

### D. Provider keys in the app

Save these once in **Settings**:

- `anthropic` (Claude) — trial key
- `elevenlabs` — ElevenLabs API key
- `falai` — fal.ai API key
- `synclabs` — Sync Labs API key

Then connect **YouTube** via the Settings OAuth button.

### E. Sync Labs model choice

- Routine tests use `lipsync-2` (unlimited).
- `sync-3` is limited to 3 free generations; use it only for a final confirmation.

---

## Remaining live-test checklist (once Cloud Run is up)

1. Create a short `single_story` project (1–2 scenes, < 20 s each).
2. Wait for `script_ready` → assign voices → `voice_ready` → `video_ready` → `lipsync_ready`.
3. Approve each scene.
4. Click **Approve All & Stitch** → project reaches `pending_review` with `finalVideoUrl`.
5. Click **Download full video** and confirm the file.
6. Click **Publish to YouTube** → review AI metadata → choose visibility → publish.
7. If `Unlisted`/`Public` is chosen, verify the "uploaded as Private / change in YouTube Studio" message.
8. Check `estimatedCostUsd` on the project and `usageLogs` entries.

---

## Notes / gotchas

- `expo-file-system/legacy` is used for `cacheDirectory`/`downloadAsync` because the new `expo-file-system` API does not expose `cacheDirectory` in the default export yet.
- `babel.config.js` now has `systemvars: true` for `react-native-dotenv` so Vercel env vars are read correctly.
- The `functions` deploy warning about `firebase-functions` version is non-blocking; upgrading to ≥5.1.0 is a future optional step.
- The `youtube` refresh token is stored under `reelforge_apikey_u{sha256(uid)}_youtube` in Secret Manager; the client never sees it.
- The Cloud Run `/upload` endpoint uses chunked resumable upload and retries as `private` if the requested visibility fails.
