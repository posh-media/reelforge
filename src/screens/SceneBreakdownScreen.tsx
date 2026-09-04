import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronUp, ChevronDown } from 'lucide-react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { useProjectsStore } from '../store/projectsStore';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';
import type { Character, Scene } from '../types';

export function SceneBreakdownScreen() {
  const route = useRoute<NativeStackScreenProps<RootStackParamList, 'SceneBreakdown'>['route']>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const projectId = route.params.projectId;

  const project = useProjectsStore((state) => state.getProjectById(projectId));
  const {
    updateSceneScript,
    updateSceneDuration,
    reorderScenes,
    addScene,
    removeScene,
    updateCharacter,
    addCharacter,
    removeCharacter,
    approveBreakdown,
  } = useProjectsStore();

  const [localScenes, setLocalScenes] = useState<Scene[]>(project?.scenes ?? []);
  const [localCharacters, setLocalCharacters] = useState<Character[]>(project?.characters ?? []);

  if (!project) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <Text className="text-textSecondary font-body">Project not found.</Text>
      </SafeAreaView>
    );
  }

  const syncScenes = (updater: (scenes: Scene[]) => Scene[]) => {
    const next = updater(localScenes);
    setLocalScenes(next);
    next.forEach((scene) => {
      updateSceneScript(projectId, scene.id, scene.script);
      updateSceneDuration(projectId, scene.id, scene.durationSeconds);
    });
  };

  const updateSceneField = (index: number, field: keyof Scene, value: string | number) => {
    const next = localScenes.map((scene, i) => (i === index ? { ...scene, [field]: value } : scene));
    setLocalScenes(next);
    const scene = next[index];
    updateSceneScript(projectId, scene.id, scene.script);
    updateSceneDuration(projectId, scene.id, scene.durationSeconds);
  };

  const handleReorder = (sceneId: string, direction: 'up' | 'down') => {
    reorderScenes(projectId, sceneId, direction);
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
    addScene(projectId, localScenes.length);
    const storeProject = useProjectsStore.getState().getProjectById(projectId);
    if (storeProject) setLocalScenes(storeProject.scenes);
  };

  const handleRemoveScene = (sceneId: string) => {
    removeScene(projectId, sceneId);
    setLocalScenes((prev) => prev.filter((s) => s.id !== sceneId));
  };

  const updateCharacterField = (index: number, field: keyof Character, value: string) => {
    const next = localCharacters.map((char, i) => (i === index ? { ...char, [field]: value } : char));
    setLocalCharacters(next);
    updateCharacter(projectId, index, next[index]);
  };

  const handleAddCharacter = () => {
    const character: Character = { name: '', description: '' };
    addCharacter(projectId, character);
    setLocalCharacters((prev) => [...prev, character]);
  };

  const handleRemoveCharacter = (index: number) => {
    removeCharacter(projectId, index);
    setLocalCharacters((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApprove = () => {
    approveBreakdown(projectId);
    navigation.navigate('MainTabs');
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
                className="bg-background text-textPrimary font-body text-base px-4 py-2 rounded-lg border border-border"
              />
            </View>
          ))}
          <Pressable onPress={handleAddCharacter} className="self-start mt-1">
            <Text className="text-accentViolet font-body-semibold text-sm">+ Add character</Text>
          </Pressable>
        </View>

        <View className="mb-2 flex-row justify-between items-center">
          <Text className="text-textPrimary font-body-semibold text-sm">Scenes</Text>
          <Text className="text-textSecondary font-body text-xs">
            Current total: {Math.round(totalDuration / 60 * 10) / 10} min
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
          disabled={localScenes.length === 0 || localScenes.some((scene) => !scene.script.trim())}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

export default SceneBreakdownScreen;
