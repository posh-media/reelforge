import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyRound, Play } from 'lucide-react-native';
import { useSettingsStore } from '../store/settingsStore';
import { Button } from '../components/Button';
import { colors } from '../theme/colors';
import type { ApiKeyEntry } from '../types';

const serviceInfo = [
  { id: 'anthropic', name: 'Anthropic (Claude)', icon: KeyRound },
  { id: 'elevenlabs', name: 'ElevenLabs', icon: KeyRound },
  { id: 'synclabs', name: 'Sync Labs', icon: KeyRound },
];

function ServiceRow({
  id,
  name,
  value,
  isConnected,
  onSave,
}: {
  id: string;
  name: string;
  value: string;
  isConnected: boolean;
  onSave: (key: string) => void;
}) {
  const [input, setInput] = useState(value);

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
        placeholder="••••••••••••"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        className="bg-background text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border mb-3"
      />
      <Button title="Save" onPress={() => onSave(input)} variant="primary" />
    </View>
  );
}

function VideoProviderRow({
  provider,
  apiKeyEntry,
  onSave,
}: {
  provider: { id: string; name: string };
  apiKeyEntry?: ApiKeyEntry;
  onSave: (key: string) => void;
}) {
  const [input, setInput] = useState(apiKeyEntry?.key ?? '');
  const isConnected = apiKeyEntry?.isConnected ?? false;

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
        placeholder="••••••••••••"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        className="bg-background text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border mb-3"
      />
      <Button title="Save" onPress={() => onSave(input)} variant="primary" />
    </View>
  );
}

export function SettingsScreen() {
  const { apiKeys, videoProviders, updateKey } = useSettingsStore();

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
              value={entry?.key ?? ''}
              isConnected={entry?.isConnected ?? false}
              onSave={(key) => updateKey(service.id, key)}
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
              onSave={(key) => updateKey(provider.apiKeyServiceId, key)}
            />
          );
        })}

        <View className="bg-surface rounded-xl p-4 mb-4 border border-border/30">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center">
              <Play size={20} color={colors.accentAmber} />
              <Text className="text-textPrimary font-body-semibold text-base ml-3">YouTube</Text>
            </View>
            <View className="bg-surfaceElevated px-2.5 py-1 rounded-full">
              <Text className="text-textSecondary text-xs font-body-semibold">Not connected</Text>
            </View>
          </View>
          <Button title="Connect YouTube" onPress={() => console.log('Connect YouTube tapped')} variant="secondary" />
        </View>

        <Text className="text-textSecondary font-body text-sm text-center mt-2">
          Keys are encrypted and stored securely — never stored on this device.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

export default SettingsScreen;
