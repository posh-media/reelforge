# Reelforge Phase 2 Report — Firebase Backend Integration

**Date:** 4 September 2026  
**Branch:** `main`  
**Commit:** `a1f1d2b`  
**Firebase project:** `reelforge-4b07d`

## Summary

Phase 2 replaced the Phase 1 mock data layer and stubbed services with a real Firebase backend. The app now authenticates users with Firebase Auth, stores projects and scenes in Firestore subcollections, seeds sample data on first login, and stores third-party API keys in Google Cloud Secret Manager via callable Cloud Functions.

## What was delivered

### 1. Firebase project setup
- Added `firebase.json` for emulator suite and deploy targets.
- Added `.firebaserc` pointing to `reelforge-4b07d`.
- Updated `.env.example` with all required Firebase environment variables.
- Configured emulator ports to avoid local conflicts:
  - Auth `9099`
  - Firestore `8082`
  - Functions `5001`
  - Storage `9199`
  - Emulator UI `4000`

### 2. Authentication
- `src/services/firebase.ts` initializes Firebase SDK with emulator detection for dev builds.
- `src/store/authStore.ts` uses `createUserWithEmailAndPassword` and `signInWithEmailAndPassword`, with a Google sign-in web placeholder.
- `src/screens/LoginScreen.tsx` toggles between sign-in and sign-up modes and shows auth errors inline.
- `src/screens/ProfileScreen.tsx` now displays the real user's `displayName` and `email`.

### 3. Firestore data model
- Projects are stored under `users/{uid}/projects/{projectId}`.
- Scenes are stored as a subcollection: `users/{uid}/projects/{projectId}/scenes/{sceneId}`.
- `src/store/projectsStore.ts` subscribes to the user's projects and each project's scenes in real time, providing actions for create, update, reorder, delete, and approve.
- On first login the store seeds the same mock catalog used in Phase 1 so the dashboard is immediately populated.

### 4. API key vault
- `src/store/settingsStore.ts` subscribes to `users/{uid}/apiKeys` and exposes `saveApiKey` and `deleteApiKey`.
- `functions/src/index.ts` implements two `onCall` functions:
  - `saveApiKey(serviceId, key)` — creates or updates a Secret Manager version for the key and writes `connected: true`, `secretRef`, and `serviceName` to Firestore.
  - `deleteApiKey(serviceId)` — destroys the secret versions, deletes the secret, and sets `connected: false` in Firestore.
- The raw key never touches Firestore or the client bundle; only a hashed `secretRef` and connection status are stored.

### 5. Security rules
- `firestore.rules` enforces user ownership and blocks any document containing a raw `secret` field.
- `storage.rules` enforces per-user project folders.
- `firestore-rules-tests/index.test.ts` runs seven rule tests with `npm run test:rules`.

### 6. Screens updated for real data
- `DashboardScreen.tsx` — reactive project list with loading state.
- `ProjectDetailScreen.tsx` — reads real scenes and writes status updates to Firestore.
- `SceneBreakdownScreen.tsx` — edits the AI-proposed breakdown locally and batches all changes when the user approves.
- `NewProjectScreen.tsx` — creates a real project and routes to Scene Breakdown for single-story mode.
- `SettingsScreen.tsx` — data-driven **Video generation** section with fal.ai, plus Save/Rotate/Disconnect buttons for each service.

### 7. Deployment
- `saveApiKey` and `deleteApiKey` deployed to `us-central1`.
- Firestore and Storage security rules deployed.
- Secret Manager API enabled and the default App Engine service account was granted `roles/secretmanager.admin` so the functions can manage secrets.

## Verification results

| Check | Result |
|-------|--------|
| TypeScript | `npx tsc --noEmit` passed |
| Web production bundle | `npx expo export --platform web` succeeded (`dist/`) |
| Firestore rules tests | `npm run test:rules` — 7/7 passed |
| Live app login + dashboard | A new user can sign up and see seeded projects immediately |
| Live key save/delete | UI saves/deletes a fal.ai key; Firestore contains no raw secret, only `secretRef` and `connected` |
| Git | Pushed to `origin/main` as `a1f1d2b` |

## Artifacts

- Screenshots for all main screens (web + mobile) are in `screenshots/`:
  - `01-login-{web,mobile}.png`
  - `02-dashboard-{web,mobile}.png`
  - `03-new-project-{web,mobile}.png`
  - `04-scene-breakdown-{web,mobile}.png`
  - `05-project-detail-{web,mobile}.png`
  - `06-settings-{web,mobile}.png`
  - `07-profile-{web,mobile}.png`

## Notes and next steps

- Native Google sign-in is still a placeholder and should be completed in a future phase.
- The default service account now has Secret Manager access. If you add more functions or need to rotate that access, the binding is in the GCP IAM console.
- Emulator suite can be started with `npm run emulators:start` for local development.
- The `.env` file is gitignored; make sure the live environment contains the correct Firebase API keys before any production deployment.
