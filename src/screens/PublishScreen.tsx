import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { functions } from '../services/firebase';
import { useProjectsStore } from '../store/projectsStore';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/types';

const generateMetadataCallable = httpsCallable(functions, 'generateVideoMetadata');
const uploadToYoutubeCallable = httpsCallable(functions, 'uploadToYoutube');

type Visibility = 'private' | 'unlisted' | 'public';

const visibilityOptions: { label: string; value: Visibility; note?: string }[] = [
  { label: 'Private', value: 'private' },
  { label: 'Unlisted', value: 'unlisted', note: 'Requires YouTube verification' },
  { label: 'Public', value: 'public', note: 'Requires YouTube verification' },
];

export function PublishScreen() {
  const route = useRoute<NativeStackScreenProps<RootStackParamList, 'Publish'>['route']>();
  const navigation = useNavigation();
  const { projectId } = route.params;
  const project = useProjectsStore((state) => state.getProjectById(projectId));
  const updateProjectStatus = useProjectsStore((state) => state.updateProjectStatus);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    if (project.youtubeDraft) {
      setTitle(project.youtubeDraft.title);
      setDescription(project.youtubeDraft.description);
      setTags(project.youtubeDraft.tags.join(', '));
    } else if (project.status === 'approved' && !isGenerating) {
      setIsGenerating(true);
      generateMetadataCallable({ projectId })
        .then((res) => {
          const data = res.data as { title?: string; description?: string; tags?: string[] };
          setTitle(data.title ?? '');
          setDescription(data.description ?? '');
          setTags((data.tags ?? []).join(', '));
        })
        .catch((err) => {
          console.error('Metadata generation failed:', err);
          setError('Failed to generate metadata. You can still type it manually.');
        })
        .finally(() => setIsGenerating(false));
    }
  }, [project?.id]);

  if (!project) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <Text className="text-textSecondary font-body">Project not found.</Text>
      </SafeAreaView>
    );
  }

  const handleRedraft = async () => {
    setIsGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await generateMetadataCallable({ projectId });
      const data = res.data as { title?: string; description?: string; tags?: string[] };
      setTitle(data.title ?? '');
      setDescription(data.description ?? '');
      setTags((data.tags ?? []).join(', '));
    } catch (err) {
      console.error('Metadata redraft failed:', err);
      setError('Failed to redraft metadata.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setError(null);
    setMessage(null);
    try {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await uploadToYoutubeCallable({
        projectId,
        title: title.trim(),
        description: description.trim(),
        tags: tagList,
        visibility,
      });
      const data = res.data as {
        videoId?: string;
        youtubeUrl?: string;
        visibility?: string;
        downgraded?: boolean;
        warning?: string;
      };
      let msg = '';
      if (data.downgraded) {
        msg =
          'This video was uploaded as Private. Public/Unlisted uploads will be available once YouTube verification is complete — you can change visibility manually in YouTube Studio for now.';
      } else {
        msg = 'Uploaded to YouTube successfully.';
      }
      if (data.warning) {
        msg = msg ? `${msg}\n\n${data.warning}` : data.warning;
      }
      setMessage(msg);
      await updateProjectStatus(projectId, 'uploaded');
    } catch (err) {
      console.error('Publish failed:', err);
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setError(message);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View className="mb-6">
          <Text className="text-textPrimary font-display text-2xl mb-3" numberOfLines={2}>
            Publish to YouTube
          </Text>
          <StatusBadge status={project.status} />
        </View>

        {isGenerating && (
          <View className="flex-row items-center mb-4">
            <ActivityIndicator size="small" color={colors.accentAmber} />
            <Text className="text-textSecondary font-body text-sm ml-3">Drafting metadata with Claude…</Text>
          </View>
        )}

        {message && (
          <View className="bg-statusSuccess/10 border border-statusSuccess/30 rounded-xl p-4 mb-4">
            <Text className="text-statusSuccess font-body text-sm">{message}</Text>
          </View>
        )}

        {error && (
          <View className="bg-statusError/10 border border-statusError/30 rounded-xl p-4 mb-4">
            <Text className="text-statusError font-body text-sm">{error}</Text>
          </View>
        )}

        <View className="bg-surface rounded-xl p-4 mb-6 border border-border/30">
          <Text className="text-textPrimary font-body-semibold text-base mb-2">Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Video title"
            placeholderTextColor={colors.textSecondary}
            className="bg-background text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border mb-4"
          />

          <Text className="text-textPrimary font-body-semibold text-base mb-2">Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Video description"
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            className="bg-background text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border mb-4"
            style={{ textAlignVertical: 'top' }}
          />

          <Text className="text-textPrimary font-body-semibold text-base mb-2">Tags</Text>
          <TextInput
            value={tags}
            onChangeText={setTags}
            placeholder="Comma separated tags"
            placeholderTextColor={colors.textSecondary}
            className="bg-background text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border mb-4"
          />

          <Text className="text-textPrimary font-body-semibold text-base mb-2">Visibility</Text>
          <View className="flex-row flex-wrap mb-2">
            {visibilityOptions.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setVisibility(option.value)}
                className={[
                  'px-4 py-2 rounded-full border mr-2 mb-2',
                  visibility === option.value
                    ? 'bg-accentAmber border-accentAmber'
                    : 'bg-surfaceElevated border-border',
                ].join(' ')}
              >
                <Text
                  className={[
                    'font-body text-sm',
                    visibility === option.value ? 'text-background' : 'text-textPrimary',
                  ].join(' ')}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {(visibility === 'unlisted' || visibility === 'public') && (
            <Text className="text-statusWarning font-body text-xs mb-2">
              Unverified Google Cloud projects can only upload as Private. If this is selected, the upload will be retried as Private and a notice will be shown.
            </Text>
          )}
        </View>

        <View className="mb-4">
          <Button
            title={isPublishing ? 'Uploading…' : 'Publish to YouTube'}
            onPress={handlePublish}
            variant="primary"
            disabled={isPublishing || !title.trim()}
          />
        </View>
        <Button title="Redraft with AI" onPress={handleRedraft} variant="outline" disabled={isGenerating} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default PublishScreen;
