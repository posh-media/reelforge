import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Modal,
  Pressable,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Play, Download, ExternalLink } from 'lucide-react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { downloadVideo } from '../services/downloads';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { functions, storage } from '../services/firebase';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Video, ResizeMode } from 'expo-av';
import { StatusBadge } from '../components/StatusBadge';
import { PipelineTracker } from '../components/PipelineTracker';
import { Button } from '../components/Button';
import { useProjectsStore } from '../store/projectsStore';
import { useAuthStore } from '../store/authStore';
import { registerForPushNotificationsAsync } from '../services/notifications';
import { colors } from '../theme/colors';
import type { RejectionReason, Scene, SceneStatus } from '../types';
import type { RootStackParamList } from '../navigation/types';

function useDownloadUrl(storagePath?: string) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!storagePath) {
      setUrl(null);
      return;
    }
    const load = async () => {
      try {
        if (storagePath.startsWith('http')) {
          setUrl(storagePath);
          return;
        }
        const storageRef = ref(storage, storagePath);
        const downloadUrl = await getDownloadURL(storageRef);
        if (mounted) setUrl(downloadUrl);
      } catch (err) {
        console.error('Failed to get download URL:', err);
        if (mounted) setUrl(null);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [storagePath]);

  return url;
}

const rejectionReasons: RejectionReason[] = [
  'Bad script',
  'Bad video',
  'Bad voice',
  'Bad lip-sync',
  'Other',
];

function SceneCard({
  scene,
  readOnly,
  onApprove,
  onReject,
  onRegenerate,
  onDownload,
}: {
  scene: Scene;
  readOnly: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onRegenerate?: () => void;
  onDownload?: () => void;
}) {
  const [rejectModalVisible, setRejectModalVisible] = useState(false);

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 border border-border/30">
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-row items-center">
          <Text className="text-textPrimary font-body-semibold text-base mr-2">
            Scene {scene.order}
          </Text>
          <StatusBadge status={scene.status} />
        </View>
        {!readOnly && (
          <Pressable
            onPress={onDownload ?? (() => {})}
            disabled={!scene.finalVideoUrl}
            className="p-2"
          >
            <Download size={18} color={scene.finalVideoUrl ? colors.textSecondary : colors.textSecondary + '80'} />
          </Pressable>
        )}
      </View>
      <Text className="text-textPrimary font-body text-base leading-6 mb-4">
        {scene.script}
      </Text>
      <Text className="text-textSecondary font-body text-xs mb-2">
        Duration: {scene.durationSeconds}s · Characters: {scene.characterNames.join(', ') || 'TBD'}
      </Text>
      {scene.status === 'failed' && scene.lastError && (
        <Text className="text-statusError font-body text-xs mb-4">
          Error: {scene.lastError}
        </Text>
      )}
      {!readOnly && (
        <View className="flex-row flex-wrap">
          <View className="mr-2 mb-2">
            <Button title="Approve" onPress={onApprove ?? (() => {})} variant="primary" />
          </View>
          <View className="mr-2 mb-2">
            <Button
              title="Reject"
              onPress={() => setRejectModalVisible(true)}
              variant="danger"
            />
          </View>
          <Button title="Regenerate" onPress={onRegenerate ?? (() => {})} variant="outline" />
        </View>
      )}

      <Modal
        animationType="slide"
        transparent
        visible={rejectModalVisible}
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <Pressable
          className="flex-1 bg-background/80 justify-end"
          onPress={() => setRejectModalVisible(false)}
        >
          <View className="bg-surfaceElevated rounded-t-2xl p-6 border-t border-x border-border">
            <Text className="text-textPrimary font-display text-xl mb-4">
              What went wrong?
            </Text>
            <View className="flex-row flex-wrap mb-6">
              {rejectionReasons.map((reason) => (
                <Pressable
                  key={reason}
                  onPress={() => {
                    console.log(`Rejected scene ${scene.id}: ${reason}`);
                    setRejectModalVisible(false);
                    onReject?.();
                  }}
                  className="mr-3 mb-3 px-4 py-2.5 rounded-full border border-border bg-surface"
                >
                  <Text className="text-textPrimary font-body text-sm">{reason}</Text>
                </Pressable>
              ))}
            </View>
            <Button title="Cancel" onPress={() => setRejectModalVisible(false)} variant="outline" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function ProjectDetailScreen() {
  const route = useRoute<NativeStackScreenProps<RootStackParamList, 'ProjectDetail'>['route']>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const projectId = route.params?.projectId;

  const project = useProjectsStore((state) => state.getProjectById(projectId));
  const {
    updateSceneStatus,
    approveAllScenes,
    updateProjectStatus,
  } = useProjectsStore();

  const regenerateSceneCallable = httpsCallable(functions, 'regenerateScene');

  const [finalRejectModalVisible, setFinalRejectModalVisible] = useState(false);
  const { user } = useAuthStore();
  const hasRequestedPermission = useRef(false);

  useEffect(() => {
    if (project?.status === 'processing' && user && !hasRequestedPermission.current) {
      hasRequestedPermission.current = true;
      void registerForPushNotificationsAsync(user.uid);
    }
  }, [project?.status, user]);

  const finalVideoUrl = useDownloadUrl(project?.finalVideoUrl);

  if (!project) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <Text className="text-textSecondary font-body">Project not found.</Text>
      </SafeAreaView>
    );
  }

  const allApproved = project.scenes.length > 0 && project.scenes.every((scene) => scene.status === 'approved');
  const isFinalReview = project.status === 'pending_review' || project.status === 'approved' || project.status === 'uploaded';

  const handleSceneApprove = async (sceneId: string) => {
    await updateSceneStatus(projectId, sceneId, 'approved');
  };

  const handleSceneReject = async (sceneId: string) => {
    await updateSceneStatus(projectId, sceneId, 'rejected');
  };

  const handleSceneRegenerate = async (sceneId: string) => {
    try {
      await regenerateSceneCallable({ projectId, sceneId });
    } catch (err) {
      console.error('Regenerate failed:', err);
    }
  };

  const handleApproveAll = async () => {
    await approveAllScenes(projectId);
  };

  const handleFinalApprove = async () => {
    await updateProjectStatus(projectId, 'approved');
    navigation.navigate('Publish', { projectId });
  };

  const handleFinalReject = async () => {
    setFinalRejectModalVisible(false);
    await updateProjectStatus(projectId, 'processing');
  };

  const handleDownloadScene = async (scene: Scene) => {
    if (!scene.finalVideoUrl) return;
    try {
      await downloadVideo(scene.finalVideoUrl, `reelforge-scene-${scene.order}.mp4`);
    } catch (err) {
      console.error('Scene download failed:', err);
    }
  };

  const handleDownloadFull = async () => {
    if (!project.finalVideoUrl) return;
    try {
      await downloadVideo(project.finalVideoUrl, `reelforge-${project.id}-final.mp4`);
    } catch (err) {
      console.error('Full video download failed:', err);
    }
  };

  const handlePublish = () => {
    navigation.navigate('Publish', { projectId });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View className="mb-6">
          <Text className="text-textPrimary font-display text-2xl mb-3" numberOfLines={2}>
            {project.title}
          </Text>
          <View className="flex-row items-center flex-wrap">
            <StatusBadge status={project.status} />
            <Text className="text-textSecondary font-body text-sm ml-3">
              {project.scenes.length} scenes · {Math.round(project.scenes.reduce((s, scene) => s + scene.durationSeconds, 0) / 60 * 10) / 10} min · {project.videoModel}
            </Text>
          </View>
          <Text className="text-textSecondary font-body text-xs mt-2">
            Estimated cost so far: ${(project.estimatedCostUsd ?? 0).toFixed(2)}
          </Text>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-6 border border-border/30">
          <PipelineTracker project={project} />
        </View>

        {isFinalReview && (
          <View className="mb-6">
            <Text className="text-textSecondary font-body text-sm mb-2">Stitched video preview</Text>
            {finalVideoUrl ? (
              <Video
                source={{ uri: finalVideoUrl }}
                className="bg-surfaceElevated rounded-xl border border-border/30"
                style={{ width: '100%', aspectRatio: 16 / 9 }}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                isLooping={false}
              />
            ) : (
              <View
                className="bg-surfaceElevated rounded-xl items-center justify-center border border-border/30"
                style={{ aspectRatio: 16 / 9 }}
              >
                <View className="w-16 h-16 rounded-full bg-accentAmber/20 items-center justify-center">
                  <Play size={32} color={colors.accentAmber} fill={colors.accentAmber} />
                </View>
              </View>
            )}
            {project.status === 'pending_review' && (
              <View className="mt-4">
                <View className="mb-3">
                  <Button title="Approve final video" onPress={handleFinalApprove} variant="primary" />
                </View>
                <Button
                  title="Reject final video"
                  onPress={() => setFinalRejectModalVisible(true)}
                  variant="danger"
                />
              </View>
            )}
            {(project.status === 'pending_review' || project.status === 'approved' || project.status === 'uploaded') && (
              <View className="mt-4">
                <View className="mb-3">
                  <Button
                    title="Download full video"
                    onPress={handleDownloadFull}
                    variant="outline"
                    disabled={!project.finalVideoUrl}
                  />
                </View>
              </View>
            )}
            {project.status === 'approved' && (
              <View className="mt-4">
                <Button title="Publish to YouTube" onPress={handlePublish} variant="primary" />
              </View>
            )}
            {project.status === 'uploaded' && project.youtubeUrl && (
              <View className="mt-4">
                <View className="flex-row items-center mb-3">
                  <ExternalLink size={16} color={colors.accentAmber} />
                  <Text className="text-textSecondary font-body text-sm ml-2">
                    Uploaded as {project.youtubeVisibility ?? 'Private'}
                  </Text>
                </View>
                <Button title="Open on YouTube" onPress={() => project.youtubeUrl && Linking.openURL(project.youtubeUrl)} variant="secondary" />
              </View>
            )}
          </View>
        )}

        <View className="mb-2">
          <Text className="text-textPrimary font-body-semibold text-sm mb-2">
            {isFinalReview ? 'Scenes' : 'Review scenes'}
          </Text>
        </View>

        {project.scenes.length === 0 && project.status === 'draft' && (
          <Text className="text-textSecondary font-body mb-4">
            This project is still a draft. Generate it from the breakdown to create scenes.
          </Text>
        )}

        {project.scenes.length === 0 && project.status === 'breakdown_ready' && (
          <Text className="text-textSecondary font-body mb-4">
            Breakdown is ready but contains no scenes yet.
          </Text>
        )}

        {project.status === 'breakdown_ready' && (
          <View className="mb-4">
            <Button
              title="Edit breakdown"
              onPress={() => navigation.navigate('SceneBreakdown', { projectId })}
              variant="outline"
            />
          </View>
        )}

        {project.scenes.map((scene) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            readOnly={isFinalReview}
            onApprove={() => handleSceneApprove(scene.id)}
            onReject={() => handleSceneReject(scene.id)}
            onRegenerate={() => handleSceneRegenerate(scene.id)}
            onDownload={() => handleDownloadScene(scene)}
          />
        ))}

        {!isFinalReview && project.status !== 'draft' && project.status !== 'breakdown_ready' && (
          <View className="mt-2">
            <Button
              title="Approve all & stitch"
              onPress={handleApproveAll}
              variant="primary"
              disabled={!allApproved}
            />
            {!allApproved && (
              <Text className="text-textSecondary font-body text-xs mt-2 text-center">
                Approve every scene to enable stitching.
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent
        visible={finalRejectModalVisible}
        onRequestClose={() => setFinalRejectModalVisible(false)}
      >
        <Pressable
          className="flex-1 bg-background/80 justify-end"
          onPress={() => setFinalRejectModalVisible(false)}
        >
          <View className="bg-surfaceElevated rounded-t-2xl p-6 border-t border-x border-border">
            <Text className="text-textPrimary font-display text-xl mb-4">
              What went wrong with the final video?
            </Text>
            <View className="flex-row flex-wrap mb-6">
              {rejectionReasons.map((reason) => (
                <Pressable
                  key={reason}
                  onPress={() => {
                    console.log(`Final reject reason: ${reason}`);
                    handleFinalReject();
                  }}
                  className="mr-3 mb-3 px-4 py-2.5 rounded-full border border-border bg-surface"
                >
                  <Text className="text-textPrimary font-body text-sm">{reason}</Text>
                </Pressable>
              ))}
            </View>
            <Button title="Cancel" onPress={() => setFinalRejectModalVisible(false)} variant="outline" />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

export default ProjectDetailScreen;
