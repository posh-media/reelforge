import React from 'react';
import { Pressable, Text, View, ViewStyle, Platform } from 'react-native';
import type { Project } from '../types';
import { StatusBadge } from './StatusBadge';

interface ProjectCardProps {
  project: Project;
  onPress: () => void;
}

export function ProjectCard({ project, onPress }: ProjectCardProps) {
  const createdDate = new Date(project.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const generatedCount = project.scenes.filter(
    (scene) => scene.status === 'lipsync_ready' || scene.status === 'approved'
  ).length;
  const totalScenes = project.scenes.length;

  return (
    <Pressable
      onPress={onPress}
      className="bg-surface rounded-xl overflow-hidden border border-border/30"
      style={({ pressed }): ViewStyle => ({
        transform: pressed ? [{ scale: 1.02 }] : [{ scale: 1 }],
        ...Platform.select({
          web: { boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4)' },
          default: {
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 20,
            elevation: 10,
          },
        }),
      })}
    >
      <View className="h-32 bg-surfaceElevated relative">
        <View className="absolute inset-x-0 bottom-0 h-16 bg-background/80" />
        <View className="absolute top-3 right-3">
          <StatusBadge status={project.status} />
        </View>
      </View>
      <View className="p-4">
        <Text className="text-textPrimary font-display text-lg mb-1" numberOfLines={1}>
          {project.title}
        </Text>
        <Text className="text-textSecondary font-body text-sm mb-2">{createdDate}</Text>
        {totalScenes > 0 && (
          <Text className="text-textSecondary font-body text-xs">
            {generatedCount}/{totalScenes} scenes ready
          </Text>
        )}
        {totalScenes === 0 && project.status !== 'draft' && (
          <Text className="text-textSecondary font-body text-xs">Waiting for breakdown</Text>
        )}
      </View>
    </Pressable>
  );
}

export default ProjectCard;
