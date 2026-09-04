import React from 'react';
import { View, Text, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { Play } from 'lucide-react-native';
import { colors } from '../theme/colors';

export interface Voice {
  id: string;
  name: string;
  previewUrl?: string;
}

interface VoicePickerProps {
  visible: boolean;
  voices: Voice[];
  selectedId?: string;
  onSelect: (voiceId: string) => void;
  onClose: () => void;
}

export function VoicePicker({ visible, voices, selectedId, onSelect, onClose }: VoicePickerProps) {
  const playPreview = (url: string) => {
    if (Platform.OS !== 'web') return;
    const audio = new Audio(url);
    audio.play().catch(() => {
      // Preview play failures are not critical.
    });
  };

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 bg-background/80 justify-end"
        onPress={onClose}
      >
        <View className="bg-surfaceElevated rounded-t-2xl p-6 border-t border-x border-border max-h-[80%]">
          <Text className="text-textPrimary font-display text-xl mb-4">
            Select a voice
          </Text>
          <ScrollView className="mb-4">
            {voices.map((voice) => {
              const isSelected = voice.id === selectedId;
              return (
                <View
                  key={voice.id}
                  className={[
                    'flex-row items-center justify-between p-3 rounded-lg border mb-2',
                    isSelected
                      ? 'bg-accentViolet/20 border-accentViolet'
                      : 'bg-surface border-border',
                  ].join(' ')}
                >
                  <Pressable
                    onPress={() => onSelect(voice.id)}
                    className="flex-1"
                  >
                    <Text
                      className={[
                        'font-body text-base',
                        isSelected ? 'text-accentViolet' : 'text-textPrimary',
                      ].join(' ')}
                    >
                      {voice.name}
                    </Text>
                  </Pressable>
                  {voice.previewUrl && (
                    <Pressable
                      onPress={() => playPreview(voice.previewUrl!)}
                      className="p-2 ml-2"
                    >
                      <Play size={18} color={colors.accentViolet} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>
          <Pressable onPress={onClose} className="self-start">
            <Text className="text-textSecondary font-body text-sm">Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export default VoicePicker;
