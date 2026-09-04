export type ProjectStatus =
  | 'draft'
  | 'breakdown_ready'
  | 'processing'
  | 'pending_review'
  | 'approved'
  | 'uploaded';

export type SceneStatus =
  | 'pending'
  | 'script_ready'
  | 'voice_ready'
  | 'video_ready'
  | 'lipsync_ready'
  | 'approved'
  | 'rejected';

export type GenerationMode = 'single_story' | 'scene_by_scene';

export type RejectionReason =
  | 'Bad script'
  | 'Bad video'
  | 'Bad voice'
  | 'Bad lip-sync'
  | 'Other';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface Character {
  name: string;
  description: string;
}

export interface Scene {
  id: string;
  order: number;
  script: string;
  status: SceneStatus;
  characterNames: string[];
  videoUrl?: string;
  audioUrl?: string;
  durationSeconds: number;
}

export interface Project {
  id: string;
  title: string;
  genre?: string;
  generationMode: GenerationMode;
  targetDurationSeconds: number;
  videoModel: string;
  status: ProjectStatus;
  scenes: Scene[];
  characters: Character[];
  createdAt: string;
  updatedAt: string;
  idea?: string;
}

export interface ApiKeyEntry {
  serviceId: string;
  serviceName: string;
  key: string;
  isConnected: boolean;
}

export interface VideoProvider {
  id: string;
  name: string;
  apiKeyServiceId: string;
}

export interface VideoModel {
  id: string;
  name: string;
  providerId: string;
}
