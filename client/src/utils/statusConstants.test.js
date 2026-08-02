import {
  APPLICATION_STATUS_VALUES,
  APPLICATION_STATUSES as SHARED_STATUSES,
} from 'nyc-jobs-shared/constants';
import {
  APPLICATION_STATUSES,
  STATUS_COLORS,
  getStatusColor,
} from './statusConstants';

describe('statusConstants — shared data is re-exported intact', () => {
  it('keeps the shared value/label pairs in order', () => {
    expect(APPLICATION_STATUSES.map(({ value, label }) => ({ value, label }))).toEqual(
      SHARED_STATUSES.map(({ value, label }) => ({ value, label }))
    );
  });

  it('covers exactly the shared status values', () => {
    expect(APPLICATION_STATUSES.map((s) => s.value)).toEqual(APPLICATION_STATUS_VALUES);
  });
});

describe('statusConstants — Tailwind color coverage', () => {
  it('gives every status a distinct color (a missing entry would silently fall back to gray)', () => {
    const colors = APPLICATION_STATUSES.map((s) => s.color);
    expect(colors.every(Boolean)).toBe(true);
    expect(new Set(colors).size).toBe(APPLICATION_STATUS_VALUES.length);
  });

  it('has a STATUS_COLORS entry with bg/text/bar for every status value', () => {
    APPLICATION_STATUS_VALUES.forEach((value) => {
      expect(STATUS_COLORS[value]).toBeDefined();
      expect(STATUS_COLORS[value]).toEqual(
        expect.objectContaining({
          bg: expect.any(String),
          text: expect.any(String),
          bar: expect.any(String),
        })
      );
    });
  });

  it('does not define colors for statuses that do not exist', () => {
    expect(Object.keys(STATUS_COLORS).sort()).toEqual([...APPLICATION_STATUS_VALUES].sort());
  });

  it('getStatusColor returns the mapped color for each known status', () => {
    APPLICATION_STATUSES.forEach((status) => {
      expect(getStatusColor(status.value)).toBe(status.color);
    });
  });

  it('getStatusColor falls back to gray for unknown or missing statuses', () => {
    expect(getStatusColor('not-a-status')).toBe('bg-gray-100 text-gray-800');
    expect(getStatusColor(undefined)).toBe('bg-gray-100 text-gray-800');
    expect(getStatusColor(null)).toBe('bg-gray-100 text-gray-800');
  });
});
