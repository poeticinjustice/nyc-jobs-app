import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Tokens live in SecureStore (iOS Keychain / Android Keystore). AsyncStorage is
// kept only to (a) migrate values persisted by older builds and (b) act as a
// fallback on platforms where SecureStore is unavailable (e.g. web).

async function safeGetItem(key: string): Promise<string | null> {
  let secureAvailable = true;
  try {
    const value = await SecureStore.getItemAsync(key);
    if (value != null) return value;
  } catch {
    secureAvailable = false;
  }

  // One-time migration: older builds persisted via AsyncStorage. If SecureStore
  // has no value but AsyncStorage does, move it into SecureStore.
  try {
    const legacy = await AsyncStorage.getItem(key);
    if (legacy == null) return null;
    if (secureAvailable) {
      try {
        await SecureStore.setItemAsync(key, legacy);
        await AsyncStorage.removeItem(key);
      } catch {
        // Migration failed; keep the AsyncStorage copy and retry on next read.
      }
    }
    return legacy;
  } catch {
    return null;
  }
}

async function safeSetItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // SecureStore unavailable (e.g. web) — fall back to AsyncStorage.
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // ignore storage errors in environments where storage is unavailable
    }
  }
}

async function safeRemoveItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore storage errors in environments where SecureStore is unavailable
  }
  // Also clear any un-migrated legacy copy.
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore storage errors in environments where AsyncStorage is unavailable
  }
}

export const storage = {
  getItem: safeGetItem,
  setItem: safeSetItem,
  removeItem: safeRemoveItem,
};
