# Phase 4 Report — Reelforge

## 1. What's fully done and verified

| Item | Status | Evidence |
|------|--------|----------|
| YouTube OAuth flow | Done & deployed | `youtubeAuthUrl` and `youtubeOAuthCallback` Cloud Functions live; refresh token stored as a Secret Manager secret following the existing `reelforge_apikey_u{hash}_youtube` convention; Settings screen shows real connected/disconnected state |
| AI-drafted metadata | Done & deployed | `generateVideoMetadata` callable uses Claude to draft title/description/tags; `PublishScreen` prefills editable fields and supports redraft |
| Upload orchestration | Done & deployed | `uploadToYoutube` callable refreshes access tokens, calls the Cloud Run `/upload` endpoint with an authenticated Google ID token, stores `youtubeVideoId`, `youtubeUrl`, and `uploaded` status |
| Private-only downgrade | Done (code) | Cloud Run `/upload` retries as `private` if the requested `Unlisted`/`Public` upload is rejected; `PublishScreen` surfaces the exact "uploaded as Private / change in YouTube Studio" message |
| Download fallback | Done (client) | `src/services/downloads.ts` resolves Storage URLs and triggers browser download on web; uses `expo-file-system/legacy` + `expo-sharing` on native |
| Per-scene download | Done (client) | Scene card download icon is wired to `scene.finalVideoUrl` in `ProjectDetailScreen` |
| Full-project download | Done (client) | "Download full video" button added to the final review section for `pending_review`/`approved`/`uploaded` projects |
| Vercel-ready web build | Done & verified | `npx expo export --platform web` completes cleanly; `vercel.json` configures build command, `dist` output directory, and SPA rewrites; README documents which env vars go to Vercel vs stay server-side |
| Mock seed default | Done | `src/config.ts` now defaults `REELFORGE_SEED_MOCK_PROJECTS` to `false` |
| Build/compile | Done | `npx tsc --noEmit` (client) and `npm run build` (functions) both pass |
| Firestore rules | Done | `npm run test:rules` passes 7/7 |
| Functions deployment | Done | `firebase deploy --only functions` succeeded for all functions including the new `youtube*` functions |

## 2. What's built but blocked on a user action

| Item | Blocker | Exact next step |
|------|---------|-----------------|
| Cloud Run stitch service deploy | GitHub repo secrets missing | Add `GCP_SA_KEY` and `FIREBASE_TOKEN` as repository secrets, then push `main` or manually trigger the `Deploy Stitch Service to Cloud Run` workflow |
| `STITCH_SERVICE_URL` wired to `stitchProject` | Same as above | The workflow writes `functions/.env` and re-deploys functions automatically after the service is live |
| Actual `stitchProject` + full-project download + real YouTube upload test | Cloud Run not live yet | Once the workflow above completes, create a short `single_story` project, run the chain, approve all scenes, click **Approve All & Stitch**, then **Download full video**, then **Publish to YouTube** |
| YouTube OAuth end-to-end | Google OAuth client config | Add `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` to the Cloud Functions runtime env (the workflow sets them from repo secrets / `functions/.env`), then authorize the app with the target Google account and switch the OAuth consent screen to "In production" |
| Live full-project / YouTube screenshots | Cloud Run + OAuth not live | Capture after the blockers above are resolved |
| Vercel deploy | User's action | Connect the GitHub repo to Vercel (build command and output dir are already in `vercel.json`) and add the Firebase client env vars documented in README |

## 3. What's genuinely incomplete or deferred

- **Android/Expo Go deep-link return from YouTube OAuth** — the consent screen uses a static Cloud Function callback that shows a "You can close this window" page. On native, `expo-web-browser` will return to the app when the tab closes, but the Settings screen still relies on the live `apiKeys/youtube` subscription to flip the connected pill. This is acceptable for the build-now-deploy-later path; a native deep-link with `expo-linking` can be added if you want the browser to auto-close.
- **YouTube verification handling** — the code expects the private-only downgrade and surfaces it correctly, but the exact rejection code from an unverified project is not empirically confirmed. If Google returns a different HTTP status/error reason, the `/upload` endpoint may need a small tweak to the `requested_visibility != 'private'` retry condition.
- **iOS FCM / APNs** — still deferred to a future EAS build, as agreed in Phase 3. The token storage code is the same for both platforms.
- **Automated upload scheduling** — explicitly out of scope for this phase.

## 4. Verification commands run

```bash
# Client TypeScript
npx tsc --noEmit

# Functions TypeScript
cd functions && npm run build

# Firestore rules
npm run test:rules

# Web export
npx expo export --platform web

# Functions deploy
cd functions && npm run deploy
```

All passed except for one `test:rules` run that needed the stale Firestore emulator on port 8082 killed first.

## 5. Security / secrets notes

- YouTube refresh tokens are stored in Secret Manager by `youtubeOAuthCallback`, which runs under the `reelforge-secrets-manager` service account.
- `uploadToYoutube` refreshes access tokens server-side and passes only the short-lived access token to the Cloud Run `/upload` endpoint. The refresh token never reaches Cloud Run or the client.
- `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` are functions runtime env vars (server-side only), not exposed to the client bundle or Vercel.
- The Firebase client config values listed in README are the only variables meant for Vercel's public build environment.

## 6. Carry-over from Phase 3B

- The Phase 3B live end-to-end (chain through stitch, final review, cost display, screenshots) is still pending the Cloud Run workflow run.
- Once the Cloud Run service is live, the same single-story `lipsync-2` test can validate stitch, final review, download, and then proceed to the YouTube publish flow in this phase.
