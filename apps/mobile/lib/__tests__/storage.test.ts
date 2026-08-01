import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '../storage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const secureGet = SecureStore.getItemAsync as unknown as jest.Mock;
const secureSet = SecureStore.setItemAsync as unknown as jest.Mock;
const secureDelete = SecureStore.deleteItemAsync as unknown as jest.Mock;
const asyncGet = AsyncStorage.getItem as unknown as jest.Mock;
const asyncSet = AsyncStorage.setItem as unknown as jest.Mock;
const asyncRemove = AsyncStorage.removeItem as unknown as jest.Mock;

beforeEach(() => {
  secureGet.mockResolvedValue(null);
  secureSet.mockResolvedValue(undefined);
  secureDelete.mockResolvedValue(undefined);
  asyncGet.mockResolvedValue(null);
  asyncSet.mockResolvedValue(undefined);
  asyncRemove.mockResolvedValue(undefined);
});

describe('storage.getItem', () => {
  it('returns the SecureStore value and never touches AsyncStorage', async () => {
    secureGet.mockResolvedValue('secure-token');

    await expect(storage.getItem('token')).resolves.toBe('secure-token');

    expect(secureGet).toHaveBeenCalledWith('token');
    expect(asyncGet).not.toHaveBeenCalled();
    expect(secureSet).not.toHaveBeenCalled();
    expect(asyncRemove).not.toHaveBeenCalled();
  });

  it('returns null when neither store has a value', async () => {
    await expect(storage.getItem('token')).resolves.toBeNull();
    expect(asyncGet).toHaveBeenCalledWith('token');
    expect(secureSet).not.toHaveBeenCalled();
  });

  it('migrates a legacy AsyncStorage token into SecureStore on first read', async () => {
    asyncGet.mockResolvedValue('legacy-token');

    await expect(storage.getItem('token')).resolves.toBe('legacy-token');

    expect(secureSet).toHaveBeenCalledWith('token', 'legacy-token');
    expect(asyncRemove).toHaveBeenCalledWith('token');
  });

  it('deletes the legacy copy only after SecureStore accepted it', async () => {
    asyncGet.mockResolvedValue('legacy-token');
    await storage.getItem('token');
    expect(secureSet.mock.invocationCallOrder[0]).toBeLessThan(
      asyncRemove.mock.invocationCallOrder[0]
    );
  });

  it('keeps the legacy copy for a later retry if the migration write fails', async () => {
    asyncGet.mockResolvedValue('legacy-token');
    secureSet.mockRejectedValue(new Error('keychain locked'));

    await expect(storage.getItem('token')).resolves.toBe('legacy-token');
    expect(asyncRemove).not.toHaveBeenCalled();
  });

  it('does not migrate when SecureStore itself is unavailable (e.g. web)', async () => {
    secureGet.mockRejectedValue(new Error('SecureStore is not available'));
    asyncGet.mockResolvedValue('legacy-token');

    await expect(storage.getItem('token')).resolves.toBe('legacy-token');
    expect(secureSet).not.toHaveBeenCalled();
    expect(asyncRemove).not.toHaveBeenCalled();
  });

  it('swallows an AsyncStorage failure and returns null', async () => {
    asyncGet.mockRejectedValue(new Error('storage unavailable'));
    await expect(storage.getItem('token')).resolves.toBeNull();
  });

  it('is not fooled by an empty-string SecureStore value', async () => {
    secureGet.mockResolvedValue('');
    await expect(storage.getItem('token')).resolves.toBe('');
    expect(asyncGet).not.toHaveBeenCalled();
  });
});

describe('storage.setItem', () => {
  it('writes to SecureStore only', async () => {
    await storage.setItem('token', 'abc');

    expect(secureSet).toHaveBeenCalledWith('token', 'abc');
    expect(asyncSet).not.toHaveBeenCalled();
  });

  it('falls back to AsyncStorage when SecureStore is unavailable', async () => {
    secureSet.mockRejectedValue(new Error('SecureStore is not available'));

    await storage.setItem('token', 'abc');

    expect(asyncSet).toHaveBeenCalledWith('token', 'abc');
  });

  it('never rejects, even when both stores fail', async () => {
    secureSet.mockRejectedValue(new Error('nope'));
    asyncSet.mockRejectedValue(new Error('nope either'));

    await expect(storage.setItem('token', 'abc')).resolves.toBeUndefined();
  });
});

describe('storage.removeItem', () => {
  it('clears both the secure value and any un-migrated legacy copy', async () => {
    await storage.removeItem('token');

    expect(secureDelete).toHaveBeenCalledWith('token');
    expect(asyncRemove).toHaveBeenCalledWith('token');
  });

  it('still clears AsyncStorage when the SecureStore delete throws', async () => {
    secureDelete.mockRejectedValue(new Error('SecureStore is not available'));

    await expect(storage.removeItem('token')).resolves.toBeUndefined();
    expect(asyncRemove).toHaveBeenCalledWith('token');
  });

  it('never rejects, even when both stores fail', async () => {
    secureDelete.mockRejectedValue(new Error('nope'));
    asyncRemove.mockRejectedValue(new Error('nope either'));

    await expect(storage.removeItem('token')).resolves.toBeUndefined();
  });
});

describe('round trip', () => {
  it('reads back what was written once SecureStore holds the value', async () => {
    await storage.setItem('token', 'jwt-123');
    secureGet.mockResolvedValue('jwt-123');

    await expect(storage.getItem('token')).resolves.toBe('jwt-123');
  });
});
