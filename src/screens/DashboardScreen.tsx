import React from 'react';
import {
  View,
  Text,
  FlatList,
  useWindowDimensions,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Logo } from '../components/Logo';
import { ProjectCard } from '../components/ProjectCard';
import { useProjectsStore } from '../store/projectsStore';
import { colors } from '../theme/colors';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';

export function DashboardScreen() {
  const navigation = useNavigation<CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList>,
    NativeStackNavigationProp<RootStackParamList>
  >>();
  const projects = useProjectsStore((state) => state.projects);
  const isLoading = useProjectsStore((state) => state.isLoading);
  const { width } = useWindowDimensions();

  const numColumns = width >= 768 ? 3 : width >= 640 ? 2 : 1;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <View className="px-5 py-4 flex-row items-center justify-between">
        <Logo variant="wordmark" size={28} />
        <Pressable
          onPress={() => navigation.navigate('NewProject')}
          className="flex-row items-center bg-accentViolet rounded-lg px-3 py-2"
          style={({ pressed }) => ({
            opacity: pressed ? 0.85 : 1,
            transform: pressed ? [{ scale: 0.98 }] : [{ scale: 1 }],
          })}
        >
          <Plus size={18} color={colors.textPrimary} />
          <Text className="text-textPrimary font-body-semibold text-sm ml-2">New project</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.accentViolet} />
          <Text className="text-textSecondary font-body mt-4">Loading projects...</Text>
        </View>
      ) : (
        <FlatList
          data={projects}
          key={numColumns}
          numColumns={numColumns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          columnWrapperStyle={numColumns > 1 ? { gap: 16 } : undefined}
          renderItem={({ item }) => (
            <View className={numColumns === 1 ? 'mb-4' : 'flex-1'}>
              <ProjectCard
                project={item}
                onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
              />
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center justify-center py-20 px-8">
              <Text className="text-textPrimary font-display text-xl mb-2 text-center">
                No projects yet
              </Text>
              <Text className="text-textSecondary font-body text-center mb-6">
                Create your first Reelforge project to start turning stories into video.
              </Text>
              <Pressable
                onPress={() => navigation.navigate('NewProject')}
                className="flex-row items-center bg-accentViolet rounded-lg px-4 py-3"
              >
                <Plus size={18} color={colors.textPrimary} />
                <Text className="text-textPrimary font-body-semibold text-sm ml-2">New project</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

export default DashboardScreen;
