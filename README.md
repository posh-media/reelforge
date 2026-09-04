<<<<<<< HEAD
# Reelforge — Phase 1

Reelforge is a React Native + Expo app for automating AI-narrated short-story videos for YouTube. **Phase 1 covers the foundation only**: project scaffolding, design system, UI screens, and local mock data. No real backend, AI, or upload integrations are wired yet.

## Run the project

```bash
npm install
npx expo start
```

- Press `w` to open the web build.
- Scan the QR code with the Expo Go app (iOS/Android) to run on mobile.
- The app runs on iOS, Android, and web from the same codebase.

## Tech stack

- React Native + Expo (managed workflow)
- React Native Web for the web target
- TypeScript (strict mode)
- React Navigation (native-stack + bottom-tabs)
- Zustand for local state
- NativeWind / Tailwind CSS for styling
- `@expo-google-fonts/space-grotesk` and `@expo-google-fonts/inter` for typography
- Firebase SDK installed but not used yet (placeholder config)

## Folder structure

```
/src
  /components       Shared UI: Logo, Button, StatusBadge, ProjectCard, PipelineTracker
  /navigation       RootNavigator, TabNavigator, and navigation types
  /screens          Login, Dashboard, NewProject, ProjectDetail, SceneBreakdown, Settings, Profile
  /store            Zustand stores: auth, projects, settings
  /services         Placeholder service files for Firebase, Claude, TTS, fal.ai, Sync Labs, YouTube
  /types            TypeScript interfaces (Project, Scene, Character, etc.)
  /mocks            Mock users and projects used in this phase
  /theme            Color, typography, and spacing design tokens
/assets             App icons, splash screen, and favicon
/.env.example       Environment variables needed in later phases
```

## Design token system

Tokens live in `/src/theme` and are registered as Tailwind custom colors so they can be used with NativeWind classes (`bg-background`, `text-accentAmber`, etc.).

| Token | Hex | Use |
|---|---|---|
| `background` | `#0B0D14` | App base background |
| `surface` | `#151824` | Cards and panels |
| `surfaceElevated` | `#1E2233` | Elevated surfaces (modals, focused cards) |
| `border` | `#2A2E42` | Subtle borders and inputs |
| `textPrimary` | `#F2F1ED` | Headings and primary text |
| `textSecondary` | `#9497AA` | Secondary/meta text |
| `accentAmber` | `#E8A33D` | Film/creative output CTAs |
| `accentViolet` | `#7B61FF` | AI generation / processing states |
| `statusSuccess` | `#4ADE80` | Approved / uploaded |
| `statusWarning` | `#FBBF24` | Pending review |
| `statusError` | `#F87171` | Rejected / failed / logout |

## What is mocked vs. real

**Mocked in Phase 1:**

- Authentication: `isLoggedIn` is a boolean in Zustand. Tapping "Sign in" or "Continue with Google" flips it to `true`.
- Projects and scenes: All data is hardcoded in `/src/mocks/data.ts`. The scene-based data model is fully represented in the UI and stores, but no generation actually happens.
- New Project generation: Tapping "Generate" creates a local mock project with `status: 'breakdown_ready'` (single_story) or `status: 'processing'` (scene_by_scene), using the selected target duration and video model.
- Scene breakdown / review: Scripts, videos, audio, and pipelines are static placeholders. Per-scene Approve/Reject/Regenerate and project-level "Approve all & stitch" only update local Zustand state and log to the console.
- API keys: Settings inputs are masked and stored only in local Zustand state. The "Connect YouTube" button logs to the console.
- Video providers: fal.ai is the only provider in the mock list. The model chips are disabled until the provider key is saved in Settings.

**Real in Phase 1:**

- React Navigation routing and transitions
- Zustand state management
- NativeWind styling and the custom Tailwind theme
- Font loading via `expo-font`
- Scene reordering, add/remove, and editable character/scene fields in the breakdown screen

**Coming in later phases:**

- Firebase Auth, Firestore, and Cloud Functions (`/src/services/firebase.ts`)
- Claude script generation (`/src/services/claude.ts`)
- ElevenLabs TTS (`/src/services/tts.ts`)
- fal.ai video generation with Seedance/Kling/Veo (`/src/services/seedance.ts`)
- Sync Labs lip-sync (`/src/services/syncLabs.ts`)
- YouTube OAuth upload (`/src/services/youtube.ts`)

## Environment variables

Copy `.env.example` to `.env` and fill in the values when you wire the integrations in later phases. Phase 1 does not use these values.
