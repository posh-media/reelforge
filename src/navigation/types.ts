import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
  ProjectDetail: { projectId: string };
  SceneBreakdown: { projectId: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  NewProject: undefined;
  Settings: undefined;
  Profile: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
export type MainTabScreenProps<T extends keyof MainTabParamList> = BottomTabScreenProps<MainTabParamList, T>;
