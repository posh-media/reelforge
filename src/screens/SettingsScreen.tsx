import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyRound, Play, Trash2 } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { httpsCallable } from 'firebase/functions';
import { useSettingsStore } from '../store/settingsStore';
import { Button } from '../components/Button';
import { functions } from '../services/firebase';
import { colors } from '../theme/colors';
import type { ApiKeyEntry } from '../types';

const youtubeAuthUrlCallable = httpsCallable(functions, 'youtubeAuthUrl');

const serviceInfo = [
  { id: 'anthropic', name: 'Anthropic (Claude)', icon: KeyRound },
  { id: 'elevenlabs', name: 'ElevenLabs', icon: KeyRound },
  { id: 'synclabs', name: 'Sync Labs', icon: KeyRound },
];

function ServiceRow({
  id,
  name,
  isConnected,
  onSave,
  onDelete,
}: {
  id: string;
  name: string;
  isConnected: boolean;
  onSave: (key: string) => void;
  onDelete: () => void;
}) {
  const [input, setInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(input);
      setInput('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      await onDelete();
      setInput('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 border border-border/30">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-textPrimary font-body-semibold text-base">{name}</Text>
        <View
          className={[
            'px-2.5 py-1 rounded-full',
            isConnected ? 'bg-statusSuccess/20' : 'bg-surfaceElevated',
          ].join(' ')}
        >
          <Text
            className={[
              'text-xs font-body-semibold',
              isConnected ? 'text-statusSuccess' : 'text-textSecondary',
            ].join(' ')}
          >
            {isConnected ? 'Connected' : 'Not connected'}
          </Text>
        </View>
      </View>
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder={isConnected ? 'Enter new key to rotate' : '••••••••••••'}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        className="bg-background text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border mb-3"
      />
      <View className="flex-row">
        <View className="flex-1 mr-3">
          <Button
            title={isConnected ? 'Rotate key' : 'Save'}
            onPress={handleSave}
            variant="primary"
            disabled={!input.trim() || isSaving}
          />
        </View>
        {isConnected && (
          <Button
            title="Disconnect"
            onPress={handleDelete}
            variant="danger"
            disabled={isSaving}
          />
        )}
      </View>
    </View>
  );
}

function VideoProviderRow({
  provider,
  apiKeyEntry,
  onSave,
  onDelete,
}: {
  provider: { id: string; name: string };
  apiKeyEntry?: ApiKeyEntry;
  onSave: (key: string) => void;
  onDelete: () => void;
}) {
  const [input, setInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isConnected = apiKeyEntry?.isConnected ?? false;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(input);
      setInput('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      await onDelete();
      setInput('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 border border-border/30">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <Play size={18} color={colors.accentAmber} />
          <Text className="text-textPrimary font-body-semibold text-base ml-2">{provider.name}</Text>
        </View>
        <View
          className={[
            'px-2.5 py-1 rounded-full',
            isConnected ? 'bg-statusSuccess/20' : 'bg-surfaceElevated',
          ].join(' ')}
        >
          <Text
            className={[
              'text-xs font-body-semibold',
              isConnected ? 'text-statusSuccess' : 'text-textSecondary',
            ].join(' ')}
          >
            {isConnected ? 'Connected' : 'Not connected'}
          </Text>
        </View>
      </View>
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder={isConnected ? 'Enter new key to rotate' : '••••••••••••'}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        className="bg-background text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border mb-3"
      />
      <View className="flex-row">
        <View className="flex-1 mr-3">
          <Button
            title={isConnected ? 'Rotate key' : 'Save'}
            onPress={handleSave}
            variant="primary"
            disabled={!input.trim() || isSaving}
          />
        </View>
        {isConnected && (
          <Button
            title="Disconnect"
            onPress={handleDelete}
            variant="danger"
            disabled={isSaving}
          />
        )}
      </View>
    </View>
  );
}

export function SettingsScreen() {
  const { apiKeys, videoProviders, saveApiKey, deleteApiKey } = useSettingsStore();
  const [isConnectingYouTube, setIsConnectingYouTube] = useState(false);

  const youtubeEntry = apiKeys.find((k) => k.serviceId === 'youtube');
  const isYouTubeConnected = youtubeEntry?.isConnected ?? false;

  const handleConnectYouTube = async () => {
    setIsConnectingYouTube(true);
    try {
      const res = await youtubeAuthUrlCallable();
      const url = (res.data as { url?: string }).url;
      if (url) {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (err) {
      console.error('Failed to start YouTube OAuth:', err);
    } finally {
      setIsConnectingYouTube(false);
    }
  };

  const handleDisconnectYouTube = async () => {
    await deleteApiKey('youtube');
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text className="text-textPrimary font-display text-2xl mb-2">Settings</Text>
        <Text className="text-textSecondary font-body mb-6">
          API keys and service connections.
        </Text>

        {serviceInfo.map((service) => {
          const entry = apiKeys.find((k) => k.serviceId === service.id);
          return (
            <ServiceRow
              key={service.id}
              id={service.id}
              name={service.name}
              isConnected={entry?.isConnected ?? false}
              onSave={(key) => saveApiKey(service.id, key)}
              onDelete={() => deleteApiKey(service.id)}
            />
          );
        })}

        <Text className="text-textPrimary font-body-semibold text-base mb-3">Video generation</Text>
        {videoProviders.map((provider) => {
          const entry = apiKeys.find((k) => k.serviceId === provider.apiKeyServiceId);
          return (
            <VideoProviderRow
              key={provider.id}
              provider={provider}
              apiKeyEntry={entry}
              onSave={(key) => saveApiKey(provider.apiKeyServiceId, key)}
              onDelete={() => deleteApiKey(provider.apiKeyServiceId)}
            />
          );
        })}

        <View className="bg-surface rounded-xl p-4 mb-4 border border-border/30">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <Play size={20} color={colors.accentAmber} />
              <Text className="text-textPrimary font-body-semibold text-base ml-3">YouTube</Text>
            </View>
            <View
              className={[
                'px-2.5 py-1 rounded-full',
                isYouTubeConnected ? 'bg-statusSuccess/20' : 'bg-surfaceElevated',
              ].join(' ')}
            >
              <Text
                className={[
                  'text-xs font-body-semibold',
                  isYouTubeConnected ? 'text-statusSuccess' : 'text-textSecondary',
                ].join(' ')}
              >
                {isYouTubeConnected ? 'Connected' : 'Not connected'}
              </Text>
            </View>
          </View>
          {isYouTubeConnected ? (
            <Button
              title="Disconnect YouTube"
              onPress={handleDisconnectYouTube}
              variant="danger"
              disabled={isConnectingYouTube}
            />
          ) : (
            <Button
              title="Connect YouTube"
              onPress={handleConnectYouTube}
              variant="secondary"
              disabled={isConnectingYouTube}
            />
          )}
        </View>

        <Text className="text-textSecondary font-body text-sm text-center mt-2">
          Keys are encrypted and stored securely via Google Cloud Secret Manager — never stored on this device or in Firestore.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default SettingsScreen;
