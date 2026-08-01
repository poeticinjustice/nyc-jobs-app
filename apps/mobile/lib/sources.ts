import {
  JOB_SOURCES,
  SOURCE_OPTIONS as SHARED_SOURCE_OPTIONS,
} from 'nyc-jobs-shared/constants';

// Selectable source filters, in shared SOURCE_OPTIONS order. 'all' is dropped —
// on mobile it's the implicit state when nothing is selected (see
// lib/searchCriteria), not a listed option.
export const SOURCE_OPTIONS: { value: string; label: string }[] = SHARED_SOURCE_OPTIONS.filter(
  (option) => option.value !== 'all'
).map((option) => ({ value: option.value, label: option.label }));

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  SOURCE_OPTIONS.map((option) => [option.value, option.label])
);

export const SOURCE_VALUES: string[] = SOURCE_OPTIONS.map((o) => o.value);

// Every DB-valid source has a label in shared SOURCE_OPTIONS; anything that
// list forgets falls back to its raw key rather than rendering nothing.
export const getSourceLabel = (source?: string): string =>
  (source && SOURCE_LABELS[source]) || source || '';

// The canonical DB-valid source list, re-exported so callers can check
// membership without importing the shared package directly.
export const JOB_SOURCE_VALUES: string[] = [...JOB_SOURCES];
