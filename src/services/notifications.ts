import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from './firebase';

/**
 * Registers the device for push notifications and stores the token on the user.
 * Works in Expo Go (returns an Expo push token) and in standalone builds
 * (returns a native FCM token when available).
 */
export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('Push notification permission not granted');
      return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    const tokenType = token.startsWith('ExponentPushToken') ? 'expo' : 'fcm';

    await setDoc(doc(db, 'users', userId, 'fcmTokens', token), {
      token,
      tokenType,
      platform: Platform.OS,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return token;
  } catch (err) {
    console.error('Failed to register for push notifications:', err);
    return null;
  }
}

/**
 * Configures the default notification handler so notifications are shown
 * even when the app is foregrounded.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
