import { create } from 'zustand';
import type { ApiKeyEntry, VideoProvider, VideoModel } from '../types';

interface SettingsState {
  apiKeys: ApiKeyEntry[];
  videoProviders: VideoProvider[];
  videoModels: VideoModel[];
  updateKey: (serviceId: string, key: string) => void;
  isProviderConnected: (providerId: string) => boolean;
}

const initialKeys: ApiKeyEntry[] = [
  { serviceId: 'anthropic', serviceName: 'Anthropic (Claude)', key: '', isConnected: false },
  { serviceId: 'elevenlabs', serviceName: 'ElevenLabs', key: '', isConnected: false },
  { serviceId: 'falai', serviceName: 'fal.ai', key: '', isConnected: false },
  { serviceId: 'synclabs', serviceName: 'Sync Labs', key: '', isConnected: false },
];

const initialVideoProviders: VideoProvider[] = [
  { id: 'falai', name: 'fal.ai', apiKeyServiceId: 'falai' },
];

const initialVideoModels: VideoModel[] = [
  { id: 'seedance', name: 'Seedance (via fal.ai)', providerId: 'falai' },
  { id: 'kling', name: 'Kling (via fal.ai)', providerId: 'falai' },
  { id: 'veo', name: 'Veo (via fal.ai)', providerId: 'falai' },
];

export const useSettingsStore = create<SettingsState>((set, get) => ({
  apiKeys: initialKeys,
  videoProviders: initialVideoProviders,
  videoModels: initialVideoModels,
  updateKey: (serviceId, key) =>
    set((state) => ({
      apiKeys: state.apiKeys.map((entry) =>
        entry.serviceId === serviceId
          ? { ...entry, key, isConnected: key.trim().length > 0 }
          : entry
      ),
    })),
  isProviderConnected: (providerId) => {
    const provider = get().videoProviders.find((p) => p.id === providerId);
    if (!provider) return false;
    const entry = get().apiKeys.find((k) => k.serviceId === provider.apiKeyServiceId);
    return entry?.isConnected ?? false;
  },
}));
