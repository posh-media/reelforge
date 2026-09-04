import './global.css';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme/colors';

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  if (!fontsLoaded) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={colors.accentAmber} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <RootNavigator />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
