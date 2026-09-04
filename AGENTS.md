# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Project commands

```bash
# Install dependencies
npm install

# Start the dev server (mobile + web)
npx expo start --web --port 8083

# Type-check
npx tsc --noEmit

# Run Firestore rules tests against the emulator
npm run test:rules

# Capture web/mobile screenshots for review (requires the dev server on port 3001)
node scripts/take-screenshots.js
```

## Notes for Phase 1

- NativeWind v4 is used for styling. The Babel preset is `nativewind/babel` (placed in `presets`, not `plugins`).
- The app is a single Expo codebase running on iOS, Android, and web via React Native Web.
- All backend integrations (Firebase, Claude, ElevenLabs, Seedance, Sync Labs, YouTube) are stubbed in `/src/services`.
- The active pipeline-stage glow uses an `Animated.Value` with `useNativeDriver: false` for cross-platform compatibility.
- The project data model is scene-based: a `Project` contains an array of `Scene` objects, each with its own status, script, duration, and character names.

## Notes for Phase 2

- Firebase project: `reelforge-4b07d`.
- Authentication is implemented with Firebase Auth (email + password, web Google button placeholder).
- Firestore stores projects as subcollections under `users/{uid}/projects/{projectId}/scenes/{sceneId}`.
- Cloud Functions `saveApiKey` and `deleteApiKey` store keys in Google Cloud Secret Manager and keep only a `secretRef` + `connected` flag in Firestore.
- The default App Engine service account (`reelforge-4b07d@appspot.gserviceaccount.com`) needs `roles/secretmanager.admin` for the functions to manage secrets.
- Dev mode uses the Firebase emulator suite on ports: Auth 9099, Firestore 8082, Functions 5001, Storage 9199, Emulator UI 4000.
- The production web bundle is exported with `npx expo export --platform web` and served from `dist/`. Screenshots use the production bundle on `http://localhost:3001` so they reflect the live backend.
