import { create } from 'zustand';
import type { Project, ProjectStatus, Scene, SceneStatus, Character, GenerationMode } from '../types';
import { mockProjects } from '../mocks/data';

interface ProjectsState {
  projects: Project[];
  addProject: (params: {
    title: string;
    genre?: string;
    idea?: string;
    generationMode: GenerationMode;
    targetDurationSeconds: number;
    videoModel: string;
    scenes?: Scene[];
  }) => string;
  updateProjectStatus: (id: string, status: ProjectStatus) => void;
  getProjectById: (id: string) => Project | undefined;
  updateSceneStatus: (projectId: string, sceneId: string, status: SceneStatus) => void;
  updateSceneScript: (projectId: string, sceneId: string, script: string) => void;
  updateSceneDuration: (projectId: string, sceneId: string, durationSeconds: number) => void;
  reorderScenes: (projectId: string, sceneId: string, direction: 'up' | 'down') => void;
  addScene: (projectId: string, afterOrder?: number) => void;
  removeScene: (projectId: string, sceneId: string) => void;
  updateCharacter: (projectId: string, index: number, character: Character) => void;
  addCharacter: (projectId: string, character: Character) => void;
  removeCharacter: (projectId: string, index: number) => void;
  approveBreakdown: (projectId: string) => void;
  approveAllScenes: (projectId: string) => void;
}

const createEmptyScene = (order: number): Scene => ({
  id: `scene-${Date.now()}-${order}`,
  order,
  script: '',
  status: 'pending',
  characterNames: [],
  durationSeconds: 0,
});

const reindexScenes = (scenes: Scene[]): Scene[] =>
  scenes
    .sort((a, b) => a.order - b.order)
    .map((scene, index) => ({ ...scene, order: index + 1 }));

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: mockProjects,

  addProject: ({
    title,
    genre,
    idea,
    generationMode,
    targetDurationSeconds,
    videoModel,
    scenes,
  }) => {
    const now = new Date().toISOString();
    const id = `proj-${Date.now()}`;
    const initialScenes: Scene[] =
      scenes && scenes.length > 0
        ? reindexScenes(scenes)
        : generationMode === 'single_story'
        ? []
        : [createEmptyScene(1)];

    const status: ProjectStatus =
      generationMode === 'single_story' ? 'breakdown_ready' : 'processing';

    const newProject: Project = {
      id,
      title,
      genre,
      generationMode,
      targetDurationSeconds,
      videoModel,
      status,
      scenes: initialScenes,
      characters: [],
      createdAt: now,
      updatedAt: now,
      idea,
    };
    set((state) => ({ projects: [newProject, ...state.projects] }));
    return id;
  },

  updateProjectStatus: (id, status) =>
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === id
          ? { ...project, status, updatedAt: new Date().toISOString() }
          : project
      ),
    })),

  getProjectById: (id) => get().projects.find((project) => project.id === id),

  updateSceneStatus: (projectId, sceneId, status) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        const scenes = project.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, status } : scene
        );
        return { ...project, scenes, updatedAt: new Date().toISOString() };
      }),
    })),

  updateSceneScript: (projectId, sceneId, script) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        const scenes = project.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, script } : scene
        );
        return { ...project, scenes, updatedAt: new Date().toISOString() };
      }),
    })),

  updateSceneDuration: (projectId, sceneId, durationSeconds) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        const scenes = project.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, durationSeconds } : scene
        );
        return { ...project, scenes, updatedAt: new Date().toISOString() };
      }),
    })),

  reorderScenes: (projectId, sceneId, direction) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        const scenes = reindexScenes(project.scenes);
        const index = scenes.findIndex((scene) => scene.id === sceneId);
        if (index === -1) return project;
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= scenes.length) return project;
        const tempOrder = scenes[index].order;
        scenes[index].order = scenes[swapIndex].order;
        scenes[swapIndex].order = tempOrder;
        return { ...project, scenes: reindexScenes(scenes), updatedAt: new Date().toISOString() };
      }),
    })),

  addScene: (projectId, afterOrder) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        const order = afterOrder !== undefined ? afterOrder + 1 : project.scenes.length + 1;
        const newScene = createEmptyScene(order);
        const scenes = reindexScenes([...project.scenes, newScene]);
        return { ...project, scenes, updatedAt: new Date().toISOString() };
      }),
    })),

  removeScene: (projectId, sceneId) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        const scenes = reindexScenes(project.scenes.filter((scene) => scene.id !== sceneId));
        return { ...project, scenes, updatedAt: new Date().toISOString() };
      }),
    })),

  updateCharacter: (projectId, index, character) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        const characters = [...project.characters];
        characters[index] = character;
        return { ...project, characters, updatedAt: new Date().toISOString() };
      }),
    })),

  addCharacter: (projectId, character) =>
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === projectId
          ? { ...project, characters: [...project.characters, character], updatedAt: new Date().toISOString() }
          : project
      ),
    })),

  removeCharacter: (projectId, index) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        const characters = [...project.characters];
        characters.splice(index, 1);
        return { ...project, characters, updatedAt: new Date().toISOString() };
      }),
    })),

  approveBreakdown: (projectId) =>
    set((state) => ({
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        const scenes = project.scenes.map((scene) => ({
          ...scene,
          status: (scene.script.trim() ? 'script_ready' : 'pending') as SceneStatus,
        }));
        return { ...project, status: 'processing' as ProjectStatus, scenes, updatedAt: new Date().toISOString() };
      }),
    })),

  approveAllScenes: (projectId) =>
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === projectId
          ? { ...project, status: 'pending_review' as ProjectStatus, updatedAt: new Date().toISOString() }
          : project
      ),
    })),
}));
