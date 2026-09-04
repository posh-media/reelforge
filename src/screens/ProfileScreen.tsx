import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User } from 'lucide-react-native';
import { Button } from '../components/Button';
import { useAuthStore } from '../store/authStore';
import { mockUser } from '../mocks/data';
import { colors } from '../theme/colors';

export function ProfileScreen() {
  const logout = useAuthStore((state) => state.logout);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <View className="flex-1 px-6 py-12 items-center">
        <View className="w-28 h-28 rounded-full bg-surfaceElevated items-center justify-center border border-border mb-6">
          <User size={48} color={colors.textSecondary} />
        </View>

        <Text className="text-textPrimary font-display text-2xl mb-1">{mockUser.name}</Text>
        <Text className="text-textSecondary font-body text-base mb-10">{mockUser.email}</Text>

        <Button title="Log out" onPress={logout} variant="danger" />
      </View>
    </SafeAreaView>
  );
}

export default ProfileScreen;
