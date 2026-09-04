import { create } from 'zustand';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../services/firebase';
import { useAuthStore } from './authStore';
import type { ApiKeyEntry, VideoProvider, VideoModel } from '../types';

interface SettingsState {
  apiKeys: ApiKeyEntry[];
  videoProviders: VideoProvider[];
  videoModels: VideoModel[];
  isLoading: boolean;
  isProviderConnected: (providerId: string) => boolean;
  saveApiKey: (serviceId: string, key: string) => Promise<void>;
  deleteApiKey: (serviceId: string) => Promise<void>;
}

const VIDEO_PROVIDERS: VideoProvider[] = [
  { id: 'falai', name: 'fal.ai', apiKeyServiceId: 'falai' },
];

const VIDEO_MODELS: VideoModel[] = [
  { id: 'seedance', name: 'Seedance (via fal.ai)', providerId: 'falai' },
  { id: 'kling', name: 'Kling (via fal.ai)', providerId: 'falai' },
  { id: 'veo', name: 'Veo (via fal.ai)', providerId: 'falai' },
];

const SERVICE_NAMES: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  elevenlabs: 'ElevenLabs',
  falai: 'fal.ai',
  synclabs: 'Sync Labs',
};

const saveApiKeyCallable = httpsCallable(functions, 'saveApiKey');
const deleteApiKeyCallable = httpsCallable(functions, 'deleteApiKey');

export const useSettingsStore = create<SettingsState>((set, get) => {
  let unsubscribe: (() => void) | null = null;

  const subscribeToApiKeys = (userId: string) => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    set({ apiKeys: [], isLoading: true });

    const apiKeysRef = collection(db, 'users', userId, 'apiKeys');
    unsubscribe = onSnapshot(
      apiKeysRef,
      (snapshot) => {
        const apiKeys: ApiKeyEntry[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          apiKeys.push({
            serviceId: docSnap.id,
            serviceName: (data.serviceName as string) ?? SERVICE_NAMES[docSnap.id] ?? docSnap.id,
            key: '', // The raw key is never stored on the client.
            isConnected: (data.connected as boolean) ?? false,
          });
        });
        set({ apiKeys, isLoading: false });
      },
      (err) => {
        console.error('ApiKeys subscription error:', err);
        set({ isLoading: false });
      }
    );
  };

  const unsubscribeFromApiKeys = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    set({ apiKeys: [], isLoading: false });
  };

  useAuthStore.subscribe(
    (state) => state.user,
    (user) => {
      if (user) {
        subscribeToApiKeys(user.uid);
      } else {
        unsubscribeFromApiKeys();
      }
    }
  );

  return {
    apiKeys: [],
    videoProviders: VIDEO_PROVIDERS,
    videoModels: VIDEO_MODELS,
    isLoading: false,

    isProviderConnected: (providerId) => {
      const provider = get().videoProviders.find((p) => p.id === providerId);
      if (!provider) return false;
      const entry = get().apiKeys.find((k) => k.serviceId === provider.apiKeyServiceId);
      return entry?.isConnected ?? false;
    },

    saveApiKey: async (serviceId, key) => {
      await saveApiKeyCallable({ serviceId, key });
    },

    deleteApiKey: async (serviceId) => {
      await deleteApiKeyCallable({ serviceId });
    },
  };
});
