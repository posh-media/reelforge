import { create } from 'zustand';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  type FirestoreDataConverter,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuthStore } from './authStore';
import { mockProjects } from '../mocks/data';
import type {
  Project,
  ProjectStatus,
  Scene,
  SceneStatus,
  Character,
  GenerationMode,
} from '../types';

interface ProjectsState {
  projects: Project[];
  isLoading: boolean;
  getProjectById: (id: string) => Project | undefined;
  addProject: (params: {
    title: string;
    genre?: string;
    idea?: string;
    generationMode: GenerationMode;
    targetDurationSeconds: number;
    videoModel: string;
    scenes?: Scene[];
  }) => Promise<string>;
  updateProjectStatus: (id: string, status: ProjectStatus) => Promise<void>;
  updateSceneStatus: (projectId: string, sceneId: string, status: SceneStatus) => Promise<void>;
  updateSceneScript: (projectId: string, sceneId: string, script: string) => Promise<void>;
  updateSceneDuration: (projectId: string, sceneId: string, durationSeconds: number) => Promise<void>;
  reorderScenes: (projectId: string, sceneId: string, direction: 'up' | 'down') => Promise<void>;
  addScene: (projectId: string, afterOrder?: number) => Promise<void>;
  removeScene: (projectId: string, sceneId: string) => Promise<void>;
  updateCharacter: (projectId: string, index: number, character: Character) => Promise<void>;
  addCharacter: (projectId: string, character: Character) => Promise<void>;
  removeCharacter: (projectId: string, index: number) => Promise<void>;
  approveBreakdown: (projectId: string, characters: Character[], scenes: Scene[]) => Promise<void>;
  approveAllScenes: (projectId: string) => Promise<void>;
  seedMockProjectsIfEmpty: () => Promise<void>;
}

const emptyScene = (order: number): Scene => ({
  id: `scene-${Date.now()}-${order}`,
  order,
  script: '',
  status: 'pending',
  characterNames: [],
  durationSeconds: 0,
});

function projectPath(userId: string, projectId: string) {
  return `users/${userId}/projects/${projectId}`;
}

function scenesCollection(userId: string, projectId: string) {
  return collection(db, 'users', userId, 'projects', projectId, 'scenes');
}

function projectDoc(userId: string, projectId: string) {
  return doc(db, 'users', userId, 'projects', projectId);
}

function sceneDoc(userId: string, projectId: string, sceneId: string) {
  return doc(db, 'users', userId, 'projects', projectId, 'scenes', sceneId);
}

function nowIso(): string {
  return new Date().toISOString();
}

function convertTimestamp(value: unknown): string | undefined {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return undefined;
}

function projectFromDoc(id: string, data: Record<string, unknown>): Project {
  return {
    id,
    title: (data.title as string) ?? '',
    genre: data.genre as string | undefined,
    generationMode: (data.generationMode as GenerationMode) ?? 'single_story',
    targetDurationSeconds: (data.targetDurationSeconds as number) ?? 0,
    videoModel: (data.videoModel as string) ?? '',
    status: (data.status as ProjectStatus) ?? 'draft',
    scenes: [],
    characters: (data.characters as Character[]) ?? [],
    createdAt: convertTimestamp(data.createdAt) ?? nowIso(),
    updatedAt: convertTimestamp(data.updatedAt) ?? nowIso(),
    idea: data.idea as string | undefined,
  };
}

function sceneFromDoc(id: string, data: Record<string, unknown>): Scene {
  return {
    id,
    order: (data.order as number) ?? 0,
    script: (data.script as string) ?? '',
    status: (data.status as SceneStatus) ?? 'pending',
    characterNames: (data.characterNames as string[]) ?? [],
    videoUrl: data.videoUrl as string | undefined,
    audioUrl: data.audioUrl as string | undefined,
    durationSeconds: (data.durationSeconds as number) ?? 0,
  };
}

export const useProjectsStore = create<ProjectsState>((set, get) => {
  let projectsUnsubscribe: (() => void) | null = null;
  const sceneUnsubscribes = new Map<string, () => void>();
  let hasSeeded = false;

  const subscribeToUserProjects = (userId: string) => {
    if (projectsUnsubscribe) {
      projectsUnsubscribe();
      projectsUnsubscribe = null;
    }
    sceneUnsubscribes.forEach((unsub) => unsub());
    sceneUnsubscribes.clear();

    set({ projects: [], isLoading: true });

    const projectsRef = collection(db, 'users', userId, 'projects');
    projectsUnsubscribe = onSnapshot(
      query(projectsRef, orderBy('createdAt', 'desc')),
      (snapshot) => {
        const projects: Project[] = [];
        const activeProjectIds = new Set<string>();

        snapshot.forEach((docSnap) => {
          const project = projectFromDoc(docSnap.id, docSnap.data() as Record<string, unknown>);
          activeProjectIds.add(project.id);
          projects.push(project);

          if (!sceneUnsubscribes.has(project.id)) {
            const scenesRef = query(
              scenesCollection(userId, project.id),
              orderBy('order', 'asc')
            );
            const unsub = onSnapshot(scenesRef, (scenesSnap) => {
              const scenes: Scene[] = [];
              scenesSnap.forEach((s) => {
                scenes.push(sceneFromDoc(s.id, s.data() as Record<string, unknown>));
              });
              set((state) => ({
                projects: state.projects.map((p) =>
                  p.id === project.id ? { ...p, scenes } : p
                ),
              }));
            });
            sceneUnsubscribes.set(project.id, unsub);
          }
        });

        // Remove listeners for projects that no longer exist.
        sceneUnsubscribes.forEach((unsub, pid) => {
          if (!activeProjectIds.has(pid)) {
            unsub();
            sceneUnsubscribes.delete(pid);
          }
        });

        set({ projects, isLoading: false });

        if (!hasSeeded && projects.length === 0) {
          hasSeeded = true;
          get().seedMockProjectsIfEmpty();
        }
      },
      (err) => {
        console.error('Projects subscription error:', err);
        set({ isLoading: false });
      }
    );
  };

  const unsubscribeFromUserProjects = () => {
    if (projectsUnsubscribe) {
      projectsUnsubscribe();
      projectsUnsubscribe = null;
    }
    sceneUnsubscribes.forEach((unsub) => unsub());
    sceneUnsubscribes.clear();
    set({ projects: [], isLoading: false });
  };

  useAuthStore.subscribe(
    (state) => state.user,
    (user) => {
      if (user) {
        subscribeToUserProjects(user.uid);
      } else {
        unsubscribeFromUserProjects();
      }
    }
  );

  return {
    projects: [],
    isLoading: false,

    getProjectById: (id) => get().projects.find((p) => p.id === id),

    addProject: async ({
      title,
      genre,
      idea,
      generationMode,
      targetDurationSeconds,
      videoModel,
      scenes,
    }) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');

      const now = nowIso();
      const id = `proj-${Date.now()}`;
      const status: ProjectStatus =
        generationMode === 'single_story' ? 'breakdown_ready' : 'processing';

      const initialScenes: Scene[] =
        scenes && scenes.length > 0
          ? scenes.map((s, i) => ({ ...s, order: i + 1 }))
          : generationMode === 'single_story'
          ? []
          : [emptyScene(1)];

      const projectData = {
        title,
        genre,
        generationMode,
        targetDurationSeconds,
        videoModel,
        status,
        characters: [],
        createdAt: now,
        updatedAt: now,
        idea,
      };

      await setDoc(projectDoc(user.uid, id), projectData);

      if (initialScenes.length > 0) {
        const batch = writeBatch(db);
        initialScenes.forEach((scene) => {
          const ref = sceneDoc(user.uid, id, scene.id);
          batch.set(ref, scene);
        });
        await batch.commit();
      }

      return id;
    },

    updateProjectStatus: async (id, status) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      await updateDoc(projectDoc(user.uid, id), {
        status,
        updatedAt: nowIso(),
      });
    },

    updateSceneStatus: async (projectId, sceneId, status) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      await updateDoc(sceneDoc(user.uid, projectId, sceneId), { status });
    },

    updateSceneScript: async (projectId, sceneId, script) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      await updateDoc(sceneDoc(user.uid, projectId, sceneId), { script });
    },

    updateSceneDuration: async (projectId, sceneId, durationSeconds) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      await updateDoc(sceneDoc(user.uid, projectId, sceneId), { durationSeconds });
    },

    reorderScenes: async (projectId, sceneId, direction) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      const project = get().getProjectById(projectId);
      if (!project) throw new Error('Project not found');

      const scenes = [...project.scenes].sort((a, b) => a.order - b.order);
      const index = scenes.findIndex((s) => s.id === sceneId);
      if (index === -1) return;
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= scenes.length) return;

      const a = scenes[index];
      const b = scenes[swapIndex];
      const batch = writeBatch(db);
      batch.update(sceneDoc(user.uid, projectId, a.id), { order: b.order });
      batch.update(sceneDoc(user.uid, projectId, b.id), { order: a.order });
      await batch.commit();
    },

    addScene: async (projectId, afterOrder) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      const project = get().getProjectById(projectId);
      const order = afterOrder !== undefined ? afterOrder + 1 : (project?.scenes.length ?? 0) + 1;
      const scene = emptyScene(order);
      // Make the id unique and stable.
      scene.id = `scene-${Date.now()}-${order}`;
      await setDoc(sceneDoc(user.uid, projectId, scene.id), scene);
    },

    removeScene: async (projectId, sceneId) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      await deleteDoc(sceneDoc(user.uid, projectId, sceneId));

      const project = get().getProjectById(projectId);
      if (!project) return;
      const remaining = project.scenes
        .filter((s) => s.id !== sceneId)
        .sort((a, b) => a.order - b.order)
        .map((s, i) => ({ ...s, order: i + 1 }));

      const batch = writeBatch(db);
      remaining.forEach((s) => {
        batch.update(sceneDoc(user.uid, projectId, s.id), { order: s.order });
      });
      await batch.commit();
    },

    updateCharacter: async (projectId, index, character) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      const project = get().getProjectById(projectId);
      if (!project) return;
      const characters = [...project.characters];
      characters[index] = character;
      await updateDoc(projectDoc(user.uid, projectId), {
        characters,
        updatedAt: nowIso(),
      });
    },

    addCharacter: async (projectId, character) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      const project = get().getProjectById(projectId);
      if (!project) return;
      await updateDoc(projectDoc(user.uid, projectId), {
        characters: [...project.characters, character],
        updatedAt: nowIso(),
      });
    },

    removeCharacter: async (projectId, index) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      const project = get().getProjectById(projectId);
      if (!project) return;
      const characters = [...project.characters];
      characters.splice(index, 1);
      await updateDoc(projectDoc(user.uid, projectId), {
        characters,
        updatedAt: nowIso(),
      });
    },

    approveBreakdown: async (projectId, characters, scenes) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      const project = get().getProjectById(projectId);
      if (!project) return;

      const batch = writeBatch(db);
      scenes.forEach((scene) => {
        const status: SceneStatus = scene.script.trim() ? 'script_ready' : 'pending';
        batch.set(sceneDoc(user.uid, projectId, scene.id), { ...scene, status });
      });
      // Remove any scenes that were deleted in the breakdown UI.
      project.scenes.forEach((existing) => {
        if (!scenes.find((s) => s.id === existing.id)) {
          batch.delete(sceneDoc(user.uid, projectId, existing.id));
        }
      });
      batch.update(projectDoc(user.uid, projectId), {
        status: 'processing',
        characters,
        updatedAt: nowIso(),
      });
      await batch.commit();
    },

    approveAllScenes: async (projectId) => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('Not authenticated');
      await updateDoc(projectDoc(user.uid, projectId), {
        status: 'pending_review',
        updatedAt: nowIso(),
      });
    },

    seedMockProjectsIfEmpty: async () => {
      const user = useAuthStore.getState().user;
      if (!user) return;
      if (get().projects.length > 0) return;

      const batch = writeBatch(db);
      for (const project of mockProjects) {
        const { scenes, ...projectData } = project;
        batch.set(projectDoc(user.uid, project.id), {
          ...projectData,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        for (const scene of scenes) {
          batch.set(sceneDoc(user.uid, project.id, scene.id), scene);
        }
      }
      await batch.commit();
    },
  };
});
