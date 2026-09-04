import React from 'react';
import { Text, View } from 'react-native';
import type { ProjectStatus, SceneStatus } from '../types';

type StatusBadgeStatus = ProjectStatus | SceneStatus;

interface StatusBadgeProps {
  status: StatusBadgeStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<StatusBadgeStatus, { label: string; containerClass: string; textClass: string }> = {
  draft: {
    label: 'Draft',
    containerClass: 'bg-surfaceElevated',
    textClass: 'text-textSecondary',
  },
  breakdown_ready: {
    label: 'Breakdown ready',
    containerClass: 'bg-accentViolet/20',
    textClass: 'text-accentViolet',
  },
  processing: {
    label: 'Processing',
    containerClass: 'bg-accentViolet/20',
    textClass: 'text-accentViolet',
  },
  pending_review: {
    label: 'Pending review',
    containerClass: 'bg-statusWarning/20',
    textClass: 'text-statusWarning',
  },
  approved: {
    label: 'Approved',
    containerClass: 'bg-statusSuccess/20',
    textClass: 'text-statusSuccess',
  },
  uploaded: {
    label: 'Uploaded',
    containerClass: 'bg-accentAmber/20',
    textClass: 'text-accentAmber',
  },
  pending: {
    label: 'Pending',
    containerClass: 'bg-surfaceElevated',
    textClass: 'text-textSecondary',
  },
  script_ready: {
    label: 'Script ready',
    containerClass: 'bg-accentViolet/20',
    textClass: 'text-accentViolet',
  },
  voice_ready: {
    label: 'Voice ready',
    containerClass: 'bg-accentViolet/20',
    textClass: 'text-accentViolet',
  },
  video_ready: {
    label: 'Video ready',
    containerClass: 'bg-accentViolet/20',
    textClass: 'text-accentViolet',
  },
  lipsync_ready: {
    label: 'Lip-sync ready',
    containerClass: 'bg-accentViolet/20',
    textClass: 'text-accentViolet',
  },
  video_generating: {
    label: 'Video generating',
    containerClass: 'bg-accentViolet/20',
    textClass: 'text-accentViolet',
  },
  failed: {
    label: 'Failed',
    containerClass: 'bg-statusError/20',
    textClass: 'text-statusError',
  },
  rejected: {
    label: 'Rejected',
    containerClass: 'bg-statusError/20',
    textClass: 'text-statusError',
  },
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = statusConfig[status];

  const padding = size === 'md' ? 'px-3 py-1.5' : 'px-2.5 py-1';
  const textSize = size === 'md' ? 'text-sm' : 'text-xs';

  return (
    <View className={[config.containerClass, padding, 'rounded-full self-start'].join(' ')}>
      <Text className={[config.textClass, textSize, 'font-body-semibold'].join(' ')}>
        {config.label}
      </Text>
    </View>
  );
}

export default StatusBadge;
