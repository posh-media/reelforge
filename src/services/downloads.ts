import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Resolves a Storage path to a signed download URL. If the input is already a
 * signed URL, returns it as-is.
 */
export async function resolveVideoUrl(pathOrUrl: string): Promise<string> {
  if (pathOrUrl.startsWith('http')) {
    return pathOrUrl;
  }
  return getDownloadURL(ref(storage, pathOrUrl));
}

/**
 * Triggers a video download. On web this opens the browser's save-as flow; on
 * native it downloads to the cache directory and opens the platform share sheet.
 */
export async function downloadVideo(pathOrUrl: string, filename: string): Promise<void> {
  const url = await resolveVideoUrl(pathOrUrl);

  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  const sanitized = filename.replace(/[^a-z0-9_.\-]/gi, '_');
  const ext = sanitized.endsWith('.mp4') ? '' : '.mp4';
  const localUri = `${FileSystem.cacheDirectory}${sanitized}${ext}`;

  const result = await FileSystem.downloadAsync(url, localUri);
  if (result.status !== 200) {
    throw new Error(`Download failed with status ${result.status}`);
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(localUri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
  }
}
