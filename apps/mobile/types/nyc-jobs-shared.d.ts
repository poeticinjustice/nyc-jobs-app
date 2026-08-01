// `nyc-jobs-shared` (repo root `shared/`) is plain CommonJS with no bundled
// types. It is linked in via `file:../../shared` and resolved by Metro through
// the watchFolders/nodeModulesPaths in metro.config.js. These declarations are
// the mobile-side contract for the subpaths we import — the same subpath style
// the web client uses (`nyc-jobs-shared/constants`).
declare module 'nyc-jobs-shared/constants' {
  export type LabelledOption = { value: string; label: string };

  export const APPLICATION_STATUS_VALUES: string[];
  export const APPLICATION_STATUSES: LabelledOption[];
  export const JOB_SOURCES: string[];
  export const SOURCE_OPTIONS: LabelledOption[];
  export const VALID_SOURCE_FILTERS: string[];
  export const SORT_OPTIONS: LabelledOption[];
  export const SORT_VALUES: string[];
  export const NOTE_TYPE_VALUES: string[];
  export const NOTE_PRIORITY_VALUES: string[];
  export const USER_ROLE_VALUES: string[];

  export const NAME_MAX: number;
  export const PASSWORD_MIN: number;
  export const PASSWORD_MAX: number;
  export const NOTE_TITLE_MAX: number;
  export const NOTE_CONTENT_MAX: number;
  export const SEARCH_NAME_MAX: number;
  export const DOC_LINK_MAX: number;
  export const DOC_LABEL_MAX: number;
}
