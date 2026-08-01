import { Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import api from '../api';
import { exportCsv } from '../exportCsv';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: jest.fn((directory: unknown, name: string) => ({
    directory,
    name,
    uri: `file:///cache/${name}`,
    create: jest.fn(),
    write: jest.fn(),
  })),
}));

type FakeFile = {
  uri: string;
  create: jest.Mock;
  write: jest.Mock;
};

const FileMock = File as unknown as jest.Mock;
const apiGet = api.get as unknown as jest.Mock;
const isAvailableAsync = Sharing.isAvailableAsync as unknown as jest.Mock;
const shareAsync = Sharing.shareAsync as unknown as jest.Mock;

const lastFile = (): FakeFile => FileMock.mock.results[0].value as FakeFile;

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  apiGet.mockResolvedValue({ data: 'title,url\nJob,https://x' });
  isAvailableAsync.mockResolvedValue(true);
  shareAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('exportCsv — happy path', () => {
  it('requests the CSV with the auth-bearing api client', async () => {
    await exportCsv({
      path: '/api/notes/export',
      filename: 'notes.csv',
      params: { format: 'csv' },
    });

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith('/api/notes/export', {
      params: { format: 'csv' },
      responseType: 'text',
    });
  });

  it('writes the CSV into the cache directory, overwriting any stale file', async () => {
    await exportCsv({ path: '/api/notes/export', filename: 'notes.csv' });

    expect(FileMock).toHaveBeenCalledWith(Paths.cache, 'notes.csv');
    const file = lastFile();
    expect(file.create).toHaveBeenCalledWith({ overwrite: true });
    expect(file.write).toHaveBeenCalledWith('title,url\nJob,https://x');
  });

  it('creates the file before writing to it', async () => {
    await exportCsv({ path: '/api/notes/export', filename: 'notes.csv' });
    const file = lastFile();
    expect(file.create.mock.invocationCallOrder[0]).toBeLessThan(
      file.write.mock.invocationCallOrder[0]
    );
  });

  it('hands the written file to the share sheet and resolves true', async () => {
    const result = await exportCsv({
      path: '/api/notes/export',
      filename: 'notes.csv',
      dialogTitle: 'Export Notes',
    });

    expect(result).toBe(true);
    expect(shareAsync).toHaveBeenCalledWith('file:///cache/notes.csv', {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'Export Notes',
    });
  });

  it('falls back to a generic dialog title', async () => {
    await exportCsv({ path: '/api/notes/export', filename: 'notes.csv' });
    expect(shareAsync.mock.calls[0][1]).toMatchObject({ dialogTitle: 'Export CSV' });
  });

  it('writes after the CSV has been fetched', async () => {
    await exportCsv({ path: '/api/notes/export', filename: 'notes.csv' });
    expect(apiGet.mock.invocationCallOrder[0]).toBeLessThan(
      shareAsync.mock.invocationCallOrder[0]
    );
  });
});

describe('exportCsv — response coercion', () => {
  it('stringifies a non-string response body', async () => {
    apiGet.mockResolvedValue({ data: 12345 });
    await exportCsv({ path: '/api/notes/export', filename: 'notes.csv' });
    expect(lastFile().write).toHaveBeenCalledWith('12345');
  });

  it('writes an empty file when the body is null/undefined', async () => {
    apiGet.mockResolvedValue({ data: null });
    await exportCsv({ path: '/api/notes/export', filename: 'notes.csv' });
    expect(lastFile().write).toHaveBeenCalledWith('');
  });

  it('writes an empty CSV body verbatim rather than coercing it', async () => {
    apiGet.mockResolvedValue({ data: '' });
    await exportCsv({ path: '/api/notes/export', filename: 'notes.csv' });
    expect(lastFile().write).toHaveBeenCalledWith('');
  });
});

describe('exportCsv — sharing unavailable', () => {
  beforeEach(() => {
    isAvailableAsync.mockResolvedValue(false);
  });

  it('alerts the user and resolves false instead of throwing', async () => {
    const result = await exportCsv({ path: '/api/notes/export', filename: 'notes.csv' });

    expect(result).toBe(false);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('Sharing Unavailable');
    expect(String(alertSpy.mock.calls[0][1])).toMatch(/could not be exported/i);
  });

  it('does not write a file or open the share sheet', async () => {
    await exportCsv({ path: '/api/notes/export', filename: 'notes.csv' });

    expect(FileMock).not.toHaveBeenCalled();
    expect(shareAsync).not.toHaveBeenCalled();
  });
});

describe('exportCsv — failures', () => {
  it('propagates a request failure so the caller can show its own message', async () => {
    apiGet.mockRejectedValue(new Error('Network Error'));

    await expect(
      exportCsv({ path: '/api/notes/export', filename: 'notes.csv' })
    ).rejects.toThrow('Network Error');

    expect(shareAsync).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('propagates a share failure', async () => {
    shareAsync.mockRejectedValue(new Error('user cancelled'));

    await expect(
      exportCsv({ path: '/api/notes/export', filename: 'notes.csv' })
    ).rejects.toThrow('user cancelled');
  });
});
