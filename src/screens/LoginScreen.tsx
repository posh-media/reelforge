import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '../components/Logo';
import { Button } from '../components/Button';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';

export function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = () => {
    login();
  };

  const handleGoogleSignIn = () => {
    console.log('Google sign-in tapped (Phase 1 placeholder)');
    login();
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center mb-12">
            <Logo variant="wordmark" size={56} />
            <Text className="text-textSecondary font-body text-base mt-4">
              Craft your stories into film.
            </Text>
          </View>

          <View className="max-w-md w-full self-center">
            <View className="mb-4">
              <Text className="text-textSecondary font-body text-sm mb-2">Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@studio.com"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                keyboardType="email-address"
                className="bg-surface text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border"
              />
            </View>

            <View className="mb-4">
              <Text className="text-textSecondary font-body text-sm mb-2">Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                className="bg-surface text-textPrimary font-body text-base px-4 py-3 rounded-lg border border-border"
              />
            </View>

            <View className="pt-2">
              <Button title="Sign in" onPress={handleSignIn} variant="primary" />
            </View>

            <View className="flex-row items-center my-6">
              <View className="flex-1 h-px bg-border" />
              <Text className="text-textSecondary font-body text-sm mx-4">or</Text>
              <View className="flex-1 h-px bg-border" />
            </View>

            <Pressable
              onPress={handleGoogleSignIn}
              className="flex-row items-center justify-center border border-border bg-surface rounded-lg px-4 py-3"
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                transform: pressed ? [{ scale: 0.98 }] : [{ scale: 1 }],
              })}
            >
              <View className="w-6 h-6 rounded-full bg-background items-center justify-center mr-3">
                <Text className="text-textPrimary font-display text-sm">G</Text>
              </View>
              <Text className="text-textPrimary font-body-semibold text-sm">Continue with Google</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default LoginScreen;
