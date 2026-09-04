import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { LoginScreen } from '../screens/LoginScreen';
import { ProjectDetailScreen } from '../screens/ProjectDetailScreen';
import { SceneBreakdownScreen } from '../screens/SceneBreakdownScreen';
import { TabNavigator } from './TabNavigator';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking = {
  prefixes: [],
  config: {
    screens: {
      Login: 'login',
      MainTabs: {
        path: '',
        screens: {
          Dashboard: 'dashboard',
          NewProject: 'new-project',
          Settings: 'settings',
          Profile: 'profile',
        },
      },
      ProjectDetail: 'project/:projectId',
      SceneBreakdown: 'breakdown/:projectId',
    },
  },
};

export function RootNavigator() {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return null;
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontFamily: 'SpaceGrotesk_600SemiBold' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {!user ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="MainTabs"
              component={TabNavigator}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ProjectDetail"
              component={ProjectDetailScreen}
              options={{ title: 'Review' }}
            />
            <Stack.Screen
              name="SceneBreakdown"
              component={SceneBreakdownScreen}
              options={{ title: 'Scene breakdown' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default RootNavigator;
