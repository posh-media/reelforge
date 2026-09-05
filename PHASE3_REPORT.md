# Reelforge Phase 3 Report — Real Generation, Lip-Sync, Stitch & Cost Tracking

**Date:** 5 September 2026  
**Branch:** `main`  
**Firebase project:** `reelforge-4b07d`  
**Phase 3A commit:** `1c586b1`  
**Phase 3B commit:** `42adff5`  
**Status:** Functions deployed; Cloud Run stitch service ready but not yet deployed from this environment

---

## Summary

Phase 3 turned Reelforge from a mock/placeholder pipeline into a real, provider-backed generation stack. Phase 3A added script breakdowns with Anthropic Claude, ElevenLabs TTS, fal.ai text-to-video, and scene-level orchestration. Phase 3B completed the chain with Sync Labs lip-sync, a Cloud Run ffmpeg final-stitch service, estimated cost tracking, webhook-first provider callbacks, reconciliation polling with timeouts, and the foundation for push notifications.

A dedicated `reelforge-pipeline` service account runs all generation and storage functions with the minimum IAM roles required. Raw third-party keys continue to live only in Google Secret Manager; the client, Firestore, and logs still never see them.

---

## Key decisions

### Webhook-first provider callbacks

Phase 3A started with a polling-only fal.ai completion strategy to reduce implementation risk. In Phase 3B we moved to webhook-first delivery for both **fal.ai** and **Sync Labs**, using the provider signature schemes:

- **fal.ai**: Ed25519 signature verification against the JWKS published at `https://rest.fal.ai/.well-known/jwks.json`. The function validates `X-Fal-Webhook-Request-Id`, `X-Fal-Webhook-User-Id`, `X-Fal-Webhook-Timestamp`, and `X-Fal-Webhook-Signature`, plus a ±5 minute timestamp leeway.
- **Sync Labs**: HMAC-SHA256 verification against the `Sync-Signature` header (`t=<ts>,v1=<sig>`). The webhook secret is fetched once per hour from `GET /v2/organizations/webhook/secret` and cached in function memory.

Polling was kept as a **reconciliation safety net**:

- `pollFalQueue` runs every 2 minutes and only checks jobs that are still `video_generating` and between 2 and 20 minutes old.
- `pollSyncLabs` runs every 2 minutes and only checks jobs that are still `lipsync_generating` and between 2 and 30 minutes old.
- Jobs that exceed the max age are marked `failed` with a timeout `lastError`.

### Cloud Run final stitch

Cloud Functions are not suited for ffmpeg workloads, so final scene stitching is implemented as a separate **Cloud Run service** (`cloud-run/stitch-service/`). It downloads each scene's lip-synced final video, concatenates with ffmpeg, tries a fast `-c copy` first, falls back to `libx264`/`aac` re-encode, and uploads the stitched file to Storage. The `stitchProject` Cloud Function invokes the service using a Google-signed ID token.

### FCM scope

Push notifications were deferred to the remainder of Phase 3B / a follow-up because the app is still being developed in Expo Go and full FCM token retrieval for iOS requires an EAS custom build. The architecture note is included at the end of this report.

---

## Phase 3A delivery

### Backend functions

- `generateBreakdown` — calls Claude with a Zod-backed `return_breakdown` tool, writes characters and scenes to Firestore, sets project to `breakdown_ready`.
- `listVoices` — returns ElevenLabs voices and preview URLs.
- `generateSceneVoice` — per-character TTS, concatenates multiple speakers, uploads `audio.mp3`, reads duration with `music-metadata`.
- `generateSceneVideo` — submits to fal.ai queue, stores `falRequestId`, `falEndpoint`, and `falRequestedAt`.
- `pollFalQueue` (original) — polled fal queue status every minute.
- `regenerateScene` — re-runs the appropriate failed stage.

### Client changes

- `NewProjectScreen` generates single-story breakdowns or collects explicit comma/newline character names for scene-by-scene mode.
- `VoicePicker` loads ElevenLabs voices and allows preview playback.
- `SceneBreakdownScreen` requires every character to have a `voiceId` before approval.
- `ProjectDetailScreen` wires per-scene regeneration to `regenerateScene`.
- `StatusBadge` supports `failed` and `video_generating`.
- `src/types/index.ts`, `src/store/projectsStore.ts` updated for `voiceId`, scene `dialogue`, `lastError`, and generation statuses.

### Service account

- `reelforge-pipeline@reelforge-4b07d.iam.gserviceaccount.com` was created with `roles/secretmanager.secretAccessor`, `roles/datastore.user`, and `roles/storage.objectAdmin`.

---

## Phase 3B delivery

### Webhook and reconciliation

- `falWebhook` HTTP function — Ed25519 JWKS verification, idempotent `request_id` handling, downloads the generated video, uploads to Storage as `users/{uid}/projects/{pid}/scenes/{sid}/video.mp4`, and sets `video_ready`.
- `pollFalQueue` redeployed as a reconciliation-only scheduled function (every 2 minutes) with a 20-minute timeout.
- `syncWebhook` HTTP function — HMAC-SHA256 verification, downloads the lip-sync result, uploads `final.mp4`, and sets `lipsync_ready`.
- `pollSyncLabs` scheduled function (every 2 minutes) with a 30-minute timeout.

### Lip-sync pipeline

- `doGenerateSceneLipsync` / `generateSceneLipsync` — submits the silent video and TTS audio to Sync Labs (`lipsync-2`) with a `webhook_url`.
- `onSceneUpdated` now chains `voice_ready` → video → `video_ready` → lip-sync → `lipsync_ready`.
- `regenerateScene` updated to re-run lip-sync when the scene already has a `videoUrl`.
- `lipsync_generating` added to `SceneStatus` and `StatusBadge`.

### Final stitch

- `cloud-run/stitch-service/`
  - `Dockerfile` — Python 3.11 slim + ffmpeg + gunicorn/uvicorn
  - `main.py` — FastAPI `/stitch` endpoint
  - `requirements.txt` — FastAPI, GCS, uvicorn, gunicorn, requests
- `stitchProject` Cloud Function — validates all scenes are `approved` with `finalVideoUrl`s, collects them in order, calls the Cloud Run service, then sets the project to `pending_review` and writes `project.finalVideoUrl`.
- `src/store/projectsStore.ts` `approveAllScenes` now calls the `stitchProject` callable.
- `ProjectDetailScreen` final review UI gates stitching on all scenes approved and shows final approve/reject actions.

### Cost / usage tracking

- `functions/src/pricing.ts` — static, clearly-labeled **estimate** pricing per provider/model.
- `usageLogs` subcollection under each project.
- `logUsage` helper called after Claude, ElevenLabs, fal.ai, and Sync Labs completions.
- `onUsageLogCreated` Firestore trigger increments `project.estimatedCostUsd` atomically.
- `ProjectDetailScreen` displays "Estimated cost so far: $X.XX".

### Types and status model

- `Scene` gained `finalVideoUrl`, `falRequestId`, `falEndpoint`, `falRequestedAt`, `falWebhookReceivedAt`, `syncGenerationId`, `syncRequestedAt`, `retryCount`.
- `Project` gained `finalVideoUrl` and `estimatedCostUsd`.
- `SceneStatus` gained `lipsync_generating`.

### Retry scaffolding

- `retryCount` is persisted per scene and reset by `regenerateScene`.
- Full transient-vs-permanent classification and automatic one-time retry loops are not yet implemented.

### Security / IAM updates

- `scripts/setup-pipeline-sa.js` now also grants `roles/iam.serviceAccountTokenCreator` as a **self-binding** on `reelforge-pipeline` so the pipeline SA can mint signed Storage URLs for Sync input files.
- `reelforge-pipeline` is used for all generation, webhook, and storage operations.

---

## File changes

Key new files:

- `functions/src/pipeline.ts` — all generation, webhook, polling, and orchestration functions
- `functions/src/pricing.ts` — hardcoded cost estimates
- `cloud-run/stitch-service/Dockerfile`
- `cloud-run/stitch-service/main.py`
- `cloud-run/stitch-service/requirements.txt`
- `scripts/setup-pipeline-sa.js` (updated for self-binding)
- `src/components/VoicePicker.tsx` (3A)

Key modified files:

- `functions/src/index.ts` — exports pipeline functions
- `functions/package.json` / `package-lock.json` — added `express`, `@types/express`, `google-auth-library`, `zod`, `axios`, `music-metadata`, `@anthropic-ai/sdk`
- `src/types/index.ts` — schema additions
- `src/store/projectsStore.ts` — pipeline wiring, cost fields
- `src/screens/ProjectDetailScreen.tsx` — stitch/cost/final review
- `src/screens/NewProjectScreen.tsx` (3A)
- `src/screens/SceneBreakdownScreen.tsx` (3A)
- `src/components/StatusBadge.tsx` — new statuses

---

## Verification results

| Check | Result |
|-------|--------|
| TypeScript | `npx tsc --noEmit` passed |
| Functions build | `npm run build` in `functions/` passed |
| Firestore rules | `npm run test:rules` — 7/7 passed |
| Web production bundle | `npx expo export --platform web` succeeded |
| Functions deployment | All Phase 3A + 3B functions deployed to `us-central1` |
| Cloud Run service | **Not deployed** (see next section) |
| Live end-to-end | **Not run** — requires real Anthropic/ElevenLabs/fal.ai/Sync Labs keys in Settings |
| Screenshots | **Not regenerated** for Phase 3; existing Phase 2 screenshots remain in `screenshots/` |

---

## Phase 3B follow-up status (2026-09-05)

| Item | Status |
|------|--------|
| Cloud Run stitch deploy via GitHub Actions | **Implemented** — `.github/workflows/deploy-stitch-service.yml` builds/pushes the image, deploys `stitch-service`, grants `roles/run.invoker`, writes `functions/.env`, and redeploys functions. Requires repo secrets `GCP_SA_KEY` and `FIREBASE_TOKEN`. |
| FCM push notifications | **Implemented** — `expo-notifications` + `src/services/notifications.ts` + `RootNavigator` deep-linking. Android FCM tokens are stored; Expo Go fallback uses Expo push tokens. iOS deferred to an EAS build. |
| Transient/permanent retry | **Implemented** — `isTransientError` + `executeSceneOperation` adds one-time auto-retry with 5s backoff in `doGenerateSceneVoice`, `doGenerateSceneVideo`, `doGenerateSceneLipsync`. |
| Stitched video player | **Implemented** — `expo-av` `Video` component in `ProjectDetailScreen` plays `project.finalVideoUrl` via a resolved download URL. |
| Live E2E / screenshots | **Blocked** — the Cloud Run service must be deployed first (workflow ready). Once it is live and `STITCH_SERVICE_URL` is set, the full chain and screenshots can be captured. |

## Live verification checklist (for the next session)

1. Push `main` and ensure repo secrets `GCP_SA_KEY` and `FIREBASE_TOKEN` are set so the `deploy-stitch-service` workflow runs.
2. Save the four provider keys in Settings.
3. Create a **short** `single_story` project (1–2 scenes, each under 20s).
4. Assign ElevenLabs voices, approve the breakdown, and watch `script_ready` → `voice_ready` → `video_ready` → `lipsync_ready`.
5. Approve each scene and click **Approve All & Stitch**.
6. Confirm `project.status === 'pending_review'`, `finalVideoUrl` is populated, and the player plays.
7. Confirm `usageLogs` entries and the `Estimated cost so far` total.
8. Trigger a forced provider failure (e.g. bad `falai` key) and confirm `lastError` + manual **Regenerate**.
9. Take screenshots of the Scene Breakdown voice picker, the scene-by-scene character/voice modal, the `pending_review` final review, and the cost display.

---

## Notes

- `functions/package.json` now pins `@anthropic-ai/sdk ^0.124.0`, `zod ^4.5.4`, `express ^5.2.1`, and `google-auth-library ^11.0.2`. All build and deploy cleanly.
- `music-metadata` is still used for audio duration. If any provider output format proves incompatible, it should be replaced or the fallback byte-estimate can be made the primary method.
- `pollFalQueue` runs every 2 minutes and `pollSyncLabs` every 2 minutes; both enforce a hard timeout (20 min / 30 min respectively).
- All provider webhook endpoints are public HTTP functions protected by signature verification; no API keys are transmitted in query strings or headers accessible to the client.
- Push notifications use `expo-notifications`; in Expo Go they are Expo push tokens, and in a standalone Android build they will be native FCM tokens. The `sendPushToUser` helper handles both.
