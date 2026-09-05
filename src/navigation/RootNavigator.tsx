import React, { useEffect, useRef } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { LoginScreen } from '../screens/LoginScreen';
import { ProjectDetailScreen } from '../screens/ProjectDetailScreen';
import { SceneBreakdownScreen } from '../screens/SceneBreakdownScreen';
import { TabNavigator } from './TabNavigator';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';
import type { RootStackParamList } from './types';
import { configureNotificationHandler, registerForPushNotificationsAsync } from '../services/notifications';

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
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const notificationHandlerConfigured = useRef(false);

  useEffect(() => {
    if (!notificationHandlerConfigured.current) {
      configureNotificationHandler();
      notificationHandlerConfigured.current = true;
    }
  }, []);

  useEffect(() => {
    if (user) {
      void registerForPushNotificationsAsync(user.uid);
    }
  }, [user]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { projectId?: string };
      if (data?.projectId && navigationRef.isReady()) {
        navigationRef.navigate('ProjectDetail', { projectId: data.projectId });
      }
    });
    return () => subscription.remove();
  }, [navigationRef]);

  if (isLoading) {
    return null;
  }

  return (
    <NavigationContainer linking={linking} ref={navigationRef}>
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
