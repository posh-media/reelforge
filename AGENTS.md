# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Project commands

```bash
# Install dependencies
npm install

# Start the dev server (mobile + web)
npx expo start

# Type-check
npx tsc --noEmit

# Capture web/mobile screenshots for review (requires the dev server on port 8083)
node scripts/take-screenshots.js
```

## Notes for Phase 1

- NativeWind v4 is used for styling. The Babel preset is `nativewind/babel` (placed in `presets`, not `plugins`).
- The app is a single Expo codebase running on iOS, Android, and web via React Native Web.
- All backend integrations (Firebase, Claude, ElevenLabs, Seedance, Sync Labs, YouTube) are stubbed in `/src/services`.
- The active pipeline-stage glow uses an `Animated.Value` with `useNativeDriver: false` for cross-platform compatibility.
- Auth state is not persisted across reloads in Phase 1; the screenshot script logs in on each protected URL.
- The project data model is scene-based: a `Project` contains an array of `Scene` objects, each with its own status, script, duration, and character names.
