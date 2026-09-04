import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronUp, ChevronDown } from 'lucide-react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { VoicePicker } from '../components/VoicePicker';
import { useProjectsStore } from '../store/projectsStore';
import { functions } from '../services/firebase';
import { httpsCallable } from 'firebase/functions';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import type { Character, Scene } from '../types';

export function SceneBreakdownScreen() {
  const route = useRoute<NativeStackScreenProps<RootStackParamList, 'SceneBreakdown'>['route']>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const projectId = route.params.projectId;

  const project = useProjectsStore((state) => state.getProjectById(projectId));
  const { approveBreakdown } = useProjectsStore();

  const listVoicesCallable = httpsCallable(functions, 'listVoices');
  const [voices, setVoices] = useState<{ id: string; name: string; previewUrl?: string }[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [voicePickerIndex, setVoicePickerIndex] = useState<number | null>(null);

  const [localScenes, setLocalScenes] = useState<Scene[]>([]);
  const [localCharacters, setLocalCharacters] = useState<Character[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setLocalScenes(project.scenes.slice().sort((a, b) => a.order - b.order));
      setLocalCharacters(project.characters.slice());
    }
  }, [project?.id, project?.scenes.length, project?.characters.length]);

  useEffect(() => {
    let mounted = true;
    setIsLoadingVoices(true);
    listVoicesCallable()
      .then((res: any) => {
        if (mounted) setVoices(res.data.voices ?? []);
      })
      .catch((err) => console.error('Failed to load voices:', err))
      .finally(() => {
        if (mounted) setIsLoadingVoices(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!project) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={colors.accentViolet} />
        <Text className="text-textSecondary font-body mt-4">Loading breakdown...</Text>
      </SafeAreaView>
    );
  }

  const updateSceneField = (index: number, field: keyof Scene, value: string | number) => {
    setLocalScenes((prev) =>
      prev.map((scene, i) => (i === index ? { ...scene, [field]: value } : scene))
    );
  };

  const handleReorder = (sceneId: string, direction: 'up' | 'down') => {
    setLocalScenes((prev) => {
      const next = [...prev];
      const index = next.findIndex((s) => s.id === sceneId);
      if (index === -1) return prev;
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= next.length) return prev;
      const tempOrder = next[index].order;
      next[index].order = next[swapIndex].order;
      next[swapIndex].order = tempOrder;
      return next.sort((a, b) => a.order - b.order);
    });
  };

  const handleAddScene = () => {
    setLocalScenes((prev) => {
      const order = prev.length + 1;
      return [
        ...prev,
        {
          id: `scene-${Date.now()}-${order}`,
          order,
          script: '',
          status: 'pending',
          characterNames: [],
          durationSeconds: 0,
        },
      ];
    });
  };

  const handleRemoveScene = (sceneId: string) => {
    setLocalScenes((prev) =>
      prev
        .filter((s) => s.id !== sceneId)
        .map((scene, i) => ({ ...scene, order: i + 1 }))
    );
  };

  const updateCharacterField = (index: number, field: keyof Character, value: string) => {
    setLocalCharacters((prev) =>
      prev.map((char, i) => (i === index ? { ...char, [field]: value } : char))
    );
  };

  const handleAddCharacter = () => {
    setLocalCharacters((prev) => [...prev, { name: '', description: '' }]);
  };

  const handleRemoveCharacter = (index: number) => {
    setLocalCharacters((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApprove = async () => {
    setIsSaving(true);
    try {
      await approveBreakdown(projectId, localCharacters, localScenes);
      navigation.navigate('MainTabs' as never);
    } finally {
      setIsSaving(false);
    }
  };

  const totalDuration = localScenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text className="text-textPrimary font-display text-2xl mb-2">{project.title}</Text>
        <Text className="text-textSecondary font-body mb-6">
          Review and edit the proposed scene breakdown before generation starts.
        </Text>

        <View className="bg-surface rounded-xl p-4 mb-6 border border-border/30">
          <Text className="text-textPrimary font-body-semibold text-sm mb-3">Characters</Text>
          {localCharacters.map((character, index) => (
            <View key={index} className="mb-3">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-textSecondary font-body text-xs">Character {index + 1}</Text>
                <Pressable onPress={() => handleRemoveCharacter(index)}>
                  <Text className="text-statusError font-body text-xs">Remove</Text>
                </Pressable>
              </View>
              <TextInput
                value={character.name}
                onChangeText={(text) => updateCharacterField(index, 'name', text)}
                placeholder="Name"
                placeholderTextColor={colors.textSecondary}
                className="bg-background text-textPrimary font-body text-base px-4 py-2 rounded-lg border border-border mb-2"
              />
              <TextInput
                value={character.description}
                onChangeText={(text) => updateCharacterField(index, 'description', text)}
                placeholder="Description (appearance, voice, role)"
                placeholderTextColor={colors.textSecondary}
                className="bg-background text-textPrimary font-body text-base px-4 py-2 rounded-lg border border-border mb-2"
              />
              <Pressable
                onPress={() => setVoicePickerIndex(index)}
                className="flex-row items-center justify-between bg-background px-4 py-2 rounded-lg border border-border"
              >
                <Text className="text-textPrimary font-body text-sm">
                  {character.voiceId
                    ? voices.find((v) => v.id === character.voiceId)?.name ?? 'Voice selected'
                    : 'Select voice'}
                </Text>
                {isLoadingVoices && (
                  <Text className="text-textSecondary font-body text-xs">Loading...</Text>
                )}
              </Pressable>
            </View>
          ))}
          <Pressable onPress={handleAddCharacter} className="self-start mt-1">
            <Text className="text-accentViolet font-body-semibold text-sm">+ Add character</Text>
          </Pressable>
        </View>

        <View className="mb-2 flex-row justify-between items-center">
          <Text className="text-textPrimary font-body-semibold text-sm">Scenes</Text>
          <Text className="text-textSecondary font-body text-xs">
            Current total: {Math.round((totalDuration / 60) * 10) / 10} min
          </Text>
        </View>

        {localScenes.map((scene, index) => (
          <View key={scene.id} className="bg-surface rounded-xl p-4 mb-4 border border-border/30">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-textPrimary font-body-semibold text-base">Scene {scene.order}</Text>
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => handleReorder(scene.id, 'up')}
                  disabled={index === 0}
                  className="px-2 py-1 mr-1"
                >
                  <ChevronUp
                    size={18}
                    color={index === 0 ? colors.textSecondary + '66' : colors.textSecondary}
                  />
                </Pressable>
                <Pressable
                  onPress={() => handleReorder(scene.id, 'down')}
                  disabled={index === localScenes.length - 1}
                  className="px-2 py-1 mr-2"
                >
                  <ChevronDown
                    size={18}
                    color={index === localScenes.length - 1 ? colors.textSecondary + '66' : colors.textSecondary}
                  />
                </Pressable>
                {localScenes.length > 1 && (
                  <Pressable onPress={() => handleRemoveScene(scene.id)}>
                    <Text className="text-statusError font-body text-xs">Remove</Text>
                  </Pressable>
                )}
              </View>
            </View>
            <TextInput
              value={scene.script}
              onChangeText={(text) => updateSceneField(index, 'script', text)}
              placeholder="Scene script or description..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              className="bg-background text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border mb-3 min-h-[120px]"
            />
            <View className="flex-row items-center">
              <Text className="text-textSecondary font-body text-sm mr-3">Duration (sec):</Text>
              <TextInput
                value={scene.durationSeconds.toString()}
                onChangeText={(text) => {
                  const numeric = parseInt(text, 10);
                  updateSceneField(index, 'durationSeconds', isNaN(numeric) ? 0 : numeric);
                }}
                keyboardType="numeric"
                className="bg-background text-textPrimary font-body text-base px-3 py-2 rounded-lg border border-border w-20"
              />
            </View>
          </View>
        ))}

        <Pressable onPress={handleAddScene} className="self-start mb-8">
          <Text className="text-accentViolet font-body-semibold text-sm">+ Add scene</Text>
        </Pressable>

        <Button
          title="Approve breakdown & generate"
          variant="primary"
          onPress={handleApprove}
          disabled={
            localScenes.length === 0 ||
            localScenes.some((scene) => !scene.script.trim()) ||
            localCharacters.some((c) => !c.voiceId) ||
            isSaving
          }
        />

        {voicePickerIndex !== null && (
          <VoicePicker
            visible={voicePickerIndex !== null}
            voices={voices}
            selectedId={localCharacters[voicePickerIndex]?.voiceId}
            onSelect={(voiceId) => {
              updateCharacterField(voicePickerIndex, 'voiceId', voiceId);
              setVoicePickerIndex(null);
            }}
            onClose={() => setVoicePickerIndex(null)}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default SceneBreakdownScreen;
