import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, PlusCircle, Settings, User } from 'lucide-react-native';
import { DashboardScreen } from '../screens/DashboardScreen';
import { NewProjectScreen } from '../screens/NewProjectScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { colors } from '../theme/colors';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const screenOptions = {
  headerShown: false,
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  tabBarActiveTintColor: colors.accentAmber,
  tabBarInactiveTintColor: colors.textSecondary,
};

export function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
          tabBarLabel: 'Dashboard',
        }}
      />
      <Tab.Screen
        name="NewProject"
        component={NewProjectScreen}
        options={{
          tabBarIcon: ({ color, size }) => <PlusCircle size={size} color={color} />,
          tabBarLabel: 'New project',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
          tabBarLabel: 'Settings',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
}

export default TabNavigator;
