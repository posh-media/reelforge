import React from 'react';
import { Text, View } from 'react-native';
import type { Project } from '../types';

interface PipelineTrackerProps {
  project: Project;
}

const generatedStatuses = new Set(['video_ready', 'lipsync_ready', 'approved']);

export function PipelineTracker({ project }: PipelineTrackerProps) {
  const total = project.scenes.length;
  const generated = project.scenes.filter((scene) => generatedStatuses.has(scene.status)).length;
  const approved = project.scenes.filter((scene) => scene.status === 'approved').length;

  const progress = total === 0 ? 0 : generated / total;

  return (
    <View>
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-textPrimary font-body-semibold text-sm">
          Project progress
        </Text>
        <Text className="text-textSecondary font-body text-sm">
          {generated}/{total} scenes fully generated
        </Text>
      </View>
      <View className="h-2 bg-surfaceElevated rounded-full overflow-hidden">
        <View
          className="h-full bg-accentViolet rounded-full"
          style={{ width: `${progress * 100}%` }}
        />
      </View>
      {project.status === 'pending_review' && approved === total && total > 0 && (
        <Text className="text-statusSuccess font-body text-xs mt-2">
          All scenes approved — ready for final review
        </Text>
      )}
    </View>
  );
}

export default PipelineTracker;
