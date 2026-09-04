import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { VoicePicker } from '../components/VoicePicker';
import { useProjectsStore } from '../store/projectsStore';
import { useSettingsStore } from '../store/settingsStore';
import { functions } from '../services/firebase';
import { httpsCallable } from 'firebase/functions';
import { colors } from '../theme/colors';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import type { Character, GenerationMode, Scene } from '../types';

const durationPresets = [
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
];

export function NewProjectScreen() {
  const navigation = useNavigation<CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    NativeStackNavigationProp<RootStackParamList>
  >>();
  const addProject = useProjectsStore((state) => state.addProject);
  const approveBreakdown = useProjectsStore((state) => state.approveBreakdown);
  const videoModels = useSettingsStore((state) => state.videoModels);
  const isProviderConnected = useSettingsStore((state) => state.isProviderConnected);

  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState(
    'A retired astronaut discovers a message carved into the hull of her old ship, written in her own handwriting, dated twenty years in the future.'
  );
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [generationMode, setGenerationMode] = useState<GenerationMode>('single_story');
  const [targetDurationSeconds, setTargetDurationSeconds] = useState(300);
  const [customDuration, setCustomDuration] = useState('');
  const [selectedVideoModel, setSelectedVideoModel] = useState<string | null>(null);
  const [characterInput, setCharacterInput] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([
    { id: 'new-scene-1', order: 1, script: '', status: 'pending', characterNames: [], durationSeconds: 0 },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [voiceModalProjectId, setVoiceModalProjectId] = useState<string | null>(null);
  const [voiceModalCharacters, setVoiceModalCharacters] = useState<Character[]>([]);
  const [voices, setVoices] = useState<{ id: string; name: string; previewUrl?: string }[]>([]);
  const [voicePickerIndex, setVoicePickerIndex] = useState<number | null>(null);

  const generateBreakdownCallable = httpsCallable(functions, 'generateBreakdown');
  const listVoicesCallable = httpsCallable(functions, 'listVoices');

  const selectedModel = videoModels.find((model) => model.id === selectedVideoModel);
  const selectedProvider = selectedModel
    ? useSettingsStore.getState().videoProviders.find((p) => p.id === selectedModel.providerId)
    : undefined;
  const modelConnected = selectedProvider ? isProviderConnected(selectedProvider.id) : false;
  const anyModelConnected = videoModels.some((model) => {
    const provider = useSettingsStore.getState().videoProviders.find((p) => p.id === model.providerId);
    return provider ? isProviderConnected(provider.id) : false;
  });

  const handleDurationPreset = (seconds: number) => {
    setTargetDurationSeconds(seconds);
    setCustomDuration('');
  };

  const handleCustomDuration = (value: string) => {
    setCustomDuration(value);
    const numeric = parseInt(value, 10);
    if (!isNaN(numeric) && numeric > 0) {
      setTargetDurationSeconds(numeric * 60);
    }
  };

  const updateSceneScript = (index: number, script: string) => {
    setScenes((prev) =>
      prev.map((scene, i) => (i === index ? { ...scene, script } : scene))
    );
  };

  const addScene = () => {
    setScenes((prev) => [
      ...prev,
      {
        id: `new-scene-${Date.now()}`,
        order: prev.length + 1,
        script: '',
        status: 'pending',
        characterNames: [],
        durationSeconds: 0,
      },
    ]);
  };

  const removeScene = (index: number) => {
    setScenes((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((scene, i) => ({ ...scene, order: i + 1 }))
    );
  };

  const parsedCharacters = (): Character[] =>
    characterInput
      .split(/[,\n]+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
      .map((c) => ({ name: c, description: '' }));

  const canGenerate = () => {
    if (!selectedVideoModel) return false;
    if (!modelConnected) return false;
    if (isGenerating) return false;
    if (generationMode === 'single_story') {
      return idea.trim().length > 0;
    }
    return (
      scenes.length > 0 &&
      scenes.every((scene) => scene.script.trim().length > 0) &&
      parsedCharacters().length > 0
    );
  };

  const handleGenerate = async () => {
    setBreakdownError(null);
    setIsGenerating(true);
    const derivedTitle = title.trim() || idea.split(/[.!?]/)[0].trim() || 'Untitled Project';
    try {
      const newProjectId = await addProject({
        title: derivedTitle,
        genre: selectedGenre ?? undefined,
        idea,
        generationMode,
        targetDurationSeconds,
        videoModel: selectedVideoModel!,
        scenes: generationMode === 'scene_by_scene' ? scenes : undefined,
        characters: generationMode === 'scene_by_scene' ? parsedCharacters() : undefined,
      });

      if (generationMode === 'single_story') {
        await generateBreakdownCallable({ projectId: newProjectId });
        navigation.navigate('SceneBreakdown', { projectId: newProjectId });
      } else {
        const res = await listVoicesCallable();
        setVoices((res.data as any).voices ?? []);
        setVoiceModalProjectId(newProjectId);
        setVoiceModalCharacters(parsedCharacters());
        setVoiceModalVisible(true);
      }
    } catch (err) {
      setBreakdownError(err instanceof Error ? err.message : 'Failed to start generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-textPrimary font-display text-2xl mb-2">New project</Text>
          <Text className="text-textSecondary font-body mb-6">
            Define the story, generation mode, and target length.
          </Text>

          <View className="mb-4">
            <Text className="text-textSecondary font-body text-sm mb-2">Project title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Optional title"
              placeholderTextColor={colors.textSecondary}
              className="bg-surface text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border"
            />
          </View>

          <View className="mb-6">
            <Text className="text-textSecondary font-body text-sm mb-2">Generation mode</Text>
            <View className="flex-row">
              {(['single_story', 'scene_by_scene'] as GenerationMode[]).map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => setGenerationMode(mode)}
                  className={[
                    'mr-3 px-4 py-2 rounded-full border',
                    generationMode === mode
                      ? 'bg-accentViolet/20 border-accentViolet'
                      : 'bg-surface border-border',
                  ].join(' ')}
                >
                  <Text
                    className={[
                      'font-body text-sm',
                      generationMode === mode ? 'text-accentViolet' : 'text-textSecondary',
                    ].join(' ')}
                  >
                    {mode === 'single_story' ? 'Single story' : 'Scene by scene'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text className="text-textSecondary font-body text-xs mt-2">
              {generationMode === 'single_story'
                ? 'AI will break this into scenes, define characters, and generate each one.'
                : 'Write each scene individually and keep full control over the sequence.'}
            </Text>
          </View>

          {generationMode === 'single_story' ? (
            <View className="mb-6">
              <Text className="text-textSecondary font-body text-sm mb-2">Story idea</Text>
              <TextInput
                value={idea}
                onChangeText={setIdea}
                placeholder="A retired astronaut discovers a message carved into the hull of her old ship..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
                className="bg-surface text-textPrimary font-body text-base px-4 py-4 rounded-xl border border-border min-h-[200px]"
              />
            </View>
          ) : (
            <View className="mb-6">
              <Text className="text-textSecondary font-body text-sm mb-2">Scenes</Text>
              {scenes.map((scene, index) => (
                <View key={scene.id} className="bg-surface rounded-xl p-4 border border-border mb-3">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-textPrimary font-body-semibold text-sm">
                      Scene {scene.order}
                    </Text>
                    {scenes.length > 1 && (
                      <Pressable onPress={() => removeScene(index)}>
                        <Text className="text-statusError font-body text-sm">Remove</Text>
                      </Pressable>
                    )}
                  </View>
                  <TextInput
                    value={scene.script}
                    onChangeText={(text) => updateSceneScript(index, text)}
                    placeholder="Write this scene's script..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    className="bg-background text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border"
                  />
                </View>
              ))}
              <Pressable onPress={addScene} className="self-start mt-1">
                <Text className="text-accentViolet font-body-semibold text-sm">+ Add scene</Text>
              </Pressable>
            </View>
          )}

          {generationMode === 'scene_by_scene' && (
            <View className="mb-6">
              <Text className="text-textSecondary font-body text-sm mb-2">Characters in this story</Text>
              <TextInput
                value={characterInput}
                onChangeText={setCharacterInput}
                placeholder="Daniel, Kira, The Forest"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="bg-surface text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border"
              />
              <Text className="text-textSecondary font-body text-xs mt-2">
                Separate character names with commas or new lines.
              </Text>
            </View>
          )}

          <View className="mb-6">
            <Text className="text-textSecondary font-body text-sm mb-2">Target duration</Text>
            <View className="flex-row flex-wrap mb-3">
              {durationPresets.map((preset) => (
                <Pressable
                  key={preset.seconds}
                  onPress={() => handleDurationPreset(preset.seconds)}
                  className={[
                    'mr-3 mb-3 px-4 py-2 rounded-full border',
                    targetDurationSeconds === preset.seconds && customDuration === ''
                      ? 'bg-accentAmber/20 border-accentAmber'
                      : 'bg-surface border-border',
                  ].join(' ')}
                >
                  <Text
                    className={[
                      'font-body text-sm',
                      targetDurationSeconds === preset.seconds && customDuration === ''
                        ? 'text-accentAmber'
                        : 'text-textSecondary',
                    ].join(' ')}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="flex-row items-center">
              <Text className="text-textSecondary font-body text-sm mr-3">Custom (minutes):</Text>
              <TextInput
                value={customDuration}
                onChangeText={handleCustomDuration}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                className="bg-surface text-textPrimary font-body text-base px-3 py-2 rounded-lg border border-border w-20"
              />
            </View>
            <Text className="text-textSecondary font-body text-xs mt-2">
              Longer videos will be split into more scenes automatically.
            </Text>
          </View>

          <View className="mb-8">
            <Text className="text-textSecondary font-body text-sm mb-2">Video model</Text>
            <View className="flex-row flex-wrap">
              {videoModels.map((model) => {
                const provider = useSettingsStore
                  .getState()
                  .videoProviders.find((p) => p.id === model.providerId);
                const connected = provider ? isProviderConnected(provider.id) : false;
                const selected = selectedVideoModel === model.id;

                return (
                  <Pressable
                    key={model.id}
                    onPress={() => connected && setSelectedVideoModel(model.id)}
                    className={[
                      'mr-3 mb-3 px-4 py-2 rounded-full border',
                      selected
                        ? 'bg-accentViolet/20 border-accentViolet'
                        : connected
                        ? 'bg-surface border-border'
                        : 'bg-surface border-border/50 opacity-60',
                    ].join(' ')}
                  >
                    <Text
                      className={[
                        'font-body text-sm',
                        selected ? 'text-accentViolet' : connected ? 'text-textSecondary' : 'text-textSecondary/60',
                      ].join(' ')}
                    >
                      {model.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {!anyModelConnected && (
              <Text className="text-statusError font-body text-xs mt-2">
                Connect fal.ai in Settings to use a video model.
              </Text>
            )}
            {selectedModel && !modelConnected && (
              <Text className="text-statusError font-body text-xs mt-2">
                Connect {selectedProvider?.name} in Settings to use this model.
              </Text>
            )}
          </View>

          <Button
            title={isGenerating ? 'Generating...' : 'Generate'}
            variant="secondary"
            onPress={handleGenerate}
            disabled={!canGenerate()}
          />

          {breakdownError && (
            <Text className="text-statusError font-body text-sm mt-3 text-center">{breakdownError}</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        animationType="slide"
        transparent
        visible={voiceModalVisible}
        onRequestClose={() => {}}
      >
        <View className="flex-1 bg-background p-6 pt-16">
          <Text className="text-textPrimary font-display text-2xl mb-4">
            Assign character voices
          </Text>
          <Text className="text-textSecondary font-body text-sm mb-6">
            Pick an ElevenLabs voice for each character before generating.
          </Text>

          <ScrollView className="flex-1">
            {voiceModalCharacters.map((character, index) => (
              <View key={index} className="bg-surface rounded-xl p-4 mb-4 border border-border/30">
                <Text className="text-textPrimary font-body-semibold text-base mb-2">{character.name}</Text>
                <Pressable
                  onPress={() => setVoicePickerIndex(index)}
                  className="flex-row items-center justify-between bg-background px-4 py-3 rounded-lg border border-border"
                >
                  <Text className="text-textPrimary font-body text-sm">
                    {character.voiceId
                      ? voices.find((v) => v.id === character.voiceId)?.name ?? 'Voice selected'
                      : 'Select voice'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>

          <Button
            title="Approve and generate"
            onPress={async () => {
              const pid = voiceModalProjectId;
              if (!pid) return;
              try {
                await approveBreakdown(pid, voiceModalCharacters, [
                  ...scenes,
                ]);
                setVoiceModalVisible(false);
                setVoiceModalProjectId(null);
                navigation.navigate('ProjectDetail' as any, { projectId: pid } as any);
              } catch (err) {
                setBreakdownError(err instanceof Error ? err.message : 'Failed to start generation.');
              }
            }}
            variant="primary"
            disabled={voiceModalCharacters.some((c) => !c.voiceId)}
          />
        </View>
      </Modal>

      {voicePickerIndex !== null && (
        <VoicePicker
          visible={voicePickerIndex !== null}
          voices={voices}
          selectedId={voiceModalCharacters[voicePickerIndex]?.voiceId}
          onSelect={(voiceId) => {
            const updated = [...voiceModalCharacters];
            updated[voicePickerIndex] = { ...updated[voicePickerIndex], voiceId };
            setVoiceModalCharacters(updated);
            setVoicePickerIndex(null);
          }}
          onClose={() => setVoicePickerIndex(null)}
        />
      )}
    </SafeAreaView>
  );
}

export default NewProjectScreen;
