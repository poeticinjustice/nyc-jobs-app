import { Alert } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import api from './api';

type ExportOptions = {
  /** API path returning CSV text, e.g. '/api/notes/export' */
  path: string;
  /** Name of the file handed to the share sheet, e.g. 'notes.csv' */
  filename: string;
  params?: Record<string, string | number>;
  dialogTitle?: string;
};

/**
 * Mobile equivalent of the web client's downloadFile(): fetch the CSV with the
 * auth token attached (via the api interceptor), write it to a cache file and
 * hand that file to the OS share sheet. Throws on request/write failures so
 * callers can surface their own error message.
 */
export const exportCsv = async ({
  path,
  filename,
  params,
  dialogTitle,
}: ExportOptions): Promise<boolean> => {
  const res = await api.get(path, { params, responseType: 'text' });
  const csv = typeof res.data === 'string' ? res.data : String(res.data ?? '');

  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert(
      'Sharing Unavailable',
      'This device cannot share files, so the CSV could not be exported. Try the web app to download it instead.'
    );
    return false;
  }

  const file = new File(Paths.cache, filename);
  // Overwrite any file left behind by a previous export.
  file.create({ overwrite: true });
  file.write(csv);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: dialogTitle || 'Export CSV',
  });
  return true;
};
