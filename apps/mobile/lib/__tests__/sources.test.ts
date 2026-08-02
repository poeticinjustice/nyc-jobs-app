import { JOB_SOURCES, SOURCE_OPTIONS as SHARED_SOURCE_OPTIONS } from 'nyc-jobs-shared/constants';
import {
  JOB_SOURCE_VALUES,
  SOURCE_LABELS,
  SOURCE_OPTIONS,
  SOURCE_VALUES,
  getSourceLabel,
} from '../sources';

// lib/sources.ts derives everything from the shared package (Metro resolves it
// via metro.config.js watchFolders), so there is no hand-maintained copy left
// to drift. What still needs covering is that the derivation is *complete*:
// every DB-valid source must come out the far end with a usable label.

const sorted = (values: string[]): string[] => [...values].sort();

describe('shared package wiring', () => {
  it('actually loads the shared constants', () => {
    expect(Array.isArray(JOB_SOURCES)).toBe(true);
    expect(JOB_SOURCES.length).toBeGreaterThan(0);
    expect(SHARED_SOURCE_OPTIONS.length).toBeGreaterThan(0);
  });

  it('re-exports the shared JOB_SOURCES verbatim', () => {
    expect(JOB_SOURCE_VALUES).toEqual(JOB_SOURCES);
  });

  it('copies rather than aliases the shared array, so mutation cannot leak', () => {
    expect(JOB_SOURCE_VALUES).not.toBe(JOB_SOURCES);
  });
});

describe('derivation from shared SOURCE_OPTIONS', () => {
  it('drops the "all" pseudo-source that the web filter dropdown uses', () => {
    expect(SHARED_SOURCE_OPTIONS.some((o) => o.value === 'all')).toBe(true);
    expect(SOURCE_VALUES).not.toContain('all');
    expect(SOURCE_LABELS).not.toHaveProperty('all');
  });

  it('keeps every other shared option, in shared order', () => {
    expect(SOURCE_OPTIONS).toEqual(SHARED_SOURCE_OPTIONS.filter((o) => o.value !== 'all'));
  });

  it('derives SOURCE_LABELS one-to-one from SOURCE_OPTIONS', () => {
    expect(Object.keys(SOURCE_LABELS)).toHaveLength(SOURCE_OPTIONS.length);
    for (const option of SOURCE_OPTIONS) {
      expect(SOURCE_LABELS[option.value]).toBe(option.label);
    }
  });

  it('keeps SOURCE_VALUES in SOURCE_OPTIONS order', () => {
    expect(SOURCE_VALUES).toEqual(SOURCE_OPTIONS.map((o) => o.value));
  });

  it('has no duplicate source values', () => {
    expect(new Set(SOURCE_VALUES).size).toBe(SOURCE_VALUES.length);
  });
});

describe('completeness: every DB-valid source is selectable and labelled', () => {
  it('covers exactly the sources listed in shared JOB_SOURCES', () => {
    expect(sorted(SOURCE_VALUES)).toEqual(sorted(JOB_SOURCES));
  });

  it('resolves a non-empty, trimmed label for every JOB_SOURCES key', () => {
    for (const source of JOB_SOURCES) {
      const label = getSourceLabel(source);
      expect(typeof label).toBe('string');
      expect(label.trim()).not.toBe('');
      expect(label).toBe(label.trim());
      // A real label, not just the key echoed back by the unknown-key fallback.
      expect(SOURCE_LABELS[source]).toBe(label);
    }
  });

  it('uses unique labels so the filter sheet is unambiguous', () => {
    const labels = Object.values(SOURCE_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('getSourceLabel', () => {
  it('returns the shared label for a known source', () => {
    expect(getSourceLabel('nyc')).toBe('City');
    expect(getSourceLabel('nychhc')).toBe('NYC H+H');
    expect(getSourceLabel('mta')).toBe('MTA');
  });

  it('echoes an unknown source key back rather than rendering nothing', () => {
    expect(getSourceLabel('unknown-source')).toBe('unknown-source');
    expect(getSourceLabel('all')).toBe('all');
  });

  it('returns an empty string for missing or blank input', () => {
    expect(getSourceLabel(undefined)).toBe('');
    expect(getSourceLabel('')).toBe('');
  });

  it('agrees with SOURCE_LABELS for every selectable value', () => {
    for (const value of SOURCE_VALUES) {
      expect(getSourceLabel(value)).toBe(SOURCE_LABELS[value]);
    }
  });
});
