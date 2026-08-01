import { SOURCE_LABELS, SOURCE_OPTIONS, SOURCE_VALUES, getSourceLabel } from '../sources';

// The mobile app cannot import `shared/` yet (Metro is not configured for the
// monorepo), so lib/sources.ts is a hand-maintained copy. These tests read the
// real shared constants from disk so that adding a source to `shared/` without
// updating mobile fails here instead of silently shipping a missing filter.
type SharedConstants = {
  JOB_SOURCES: string[];
  SOURCE_OPTIONS: { value: string; label: string }[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const shared = require('../../../../shared/constants/index.js') as SharedConstants;

const sorted = (values: string[]): string[] => [...values].sort();

describe('SOURCE_LABELS', () => {
  it('gives every source a non-empty, trimmed label', () => {
    const entries = Object.entries(SOURCE_LABELS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, label] of entries) {
      expect(typeof label).toBe('string');
      expect(label.trim()).not.toBe('');
      expect(label).toBe(label.trim());
      expect(key.trim()).not.toBe('');
    }
  });

  it('does not contain the pseudo-source "all"', () => {
    expect(SOURCE_LABELS).not.toHaveProperty('all');
  });

  it('uses unique labels so the filter sheet is unambiguous', () => {
    const labels = Object.values(SOURCE_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('drift against shared/constants', () => {
  it('sanity-checks that the shared constants were actually loaded', () => {
    expect(Array.isArray(shared.JOB_SOURCES)).toBe(true);
    expect(shared.JOB_SOURCES.length).toBeGreaterThan(0);
  });

  it('covers exactly the sources listed in shared JOB_SOURCES', () => {
    expect(sorted(Object.keys(SOURCE_LABELS))).toEqual(sorted(shared.JOB_SOURCES));
  });

  it('names no source that shared/constants does not know about', () => {
    const missingFromShared = SOURCE_VALUES.filter((v) => !shared.JOB_SOURCES.includes(v));
    expect(missingFromShared).toEqual([]);
  });

  it('is not missing any source shared/constants defines', () => {
    const missingFromMobile = shared.JOB_SOURCES.filter((v) => !SOURCE_VALUES.includes(v));
    expect(missingFromMobile).toEqual([]);
  });

  it('uses the same human labels as the web SOURCE_OPTIONS', () => {
    const sharedLabels = Object.fromEntries(
      shared.SOURCE_OPTIONS.filter((o) => o.value !== 'all').map((o) => [o.value, o.label])
    );
    expect(SOURCE_LABELS).toEqual(sharedLabels);
  });
});

describe('derived exports', () => {
  it('derives SOURCE_OPTIONS one-to-one from SOURCE_LABELS', () => {
    expect(SOURCE_OPTIONS).toHaveLength(Object.keys(SOURCE_LABELS).length);
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

  it('omits "all" from the selectable options (it is the implicit empty state)', () => {
    expect(SOURCE_VALUES).not.toContain('all');
  });
});

describe('getSourceLabel', () => {
  it('returns the label for a known source', () => {
    expect(getSourceLabel('nyc')).toBe('City');
    expect(getSourceLabel('nychhc')).toBe('NYC H+H');
  });

  it('echoes an unknown source key back rather than rendering nothing', () => {
    expect(getSourceLabel('unknown-source')).toBe('unknown-source');
  });

  it('returns an empty string for missing input', () => {
    expect(getSourceLabel(undefined)).toBe('');
    expect(getSourceLabel('')).toBe('');
  });

  it('resolves a label for every source in SOURCE_VALUES', () => {
    for (const value of SOURCE_VALUES) {
      expect(getSourceLabel(value)).toBe(SOURCE_LABELS[value]);
    }
  });
});
