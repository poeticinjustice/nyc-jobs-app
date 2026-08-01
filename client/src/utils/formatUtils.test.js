import * as shared from 'nyc-jobs-shared/utils/formatUtils';
import { formatSalary, formatDate, getDeadlineInfo } from './formatUtils';

const daysFromToday = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

describe('formatUtils — re-exports the shared implementations intact', () => {
  it('exports the exact shared functions', () => {
    expect(formatSalary).toBe(shared.formatSalary);
    expect(formatDate).toBe(shared.formatDate);
    expect(getDeadlineInfo).toBe(shared.getDeadlineInfo);
  });
});

describe('formatSalary', () => {
  it('formats a range', () => {
    expect(formatSalary(50000, 70000, 'Annual')).toBe('$50,000 - $70,000 Annual');
  });

  it('formats a single bound', () => {
    expect(formatSalary(50000, null, 'Annual')).toBe('$50,000 Annual');
    expect(formatSalary(null, 70000, 'Annual')).toBe('Up to $70,000 Annual');
  });

  it('falls back when there is no usable salary', () => {
    expect(formatSalary(null, null)).toBe('Salary not specified');
    expect(formatSalary(0, 0)).toBe('Salary not specified');
    expect(formatSalary('', '')).toBe('Salary not specified');
  });
});

describe('formatDate', () => {
  it('formats a Date deterministically regardless of timezone', () => {
    expect(formatDate(new Date(2025, 2, 15))).toBe('Mar 15, 2025');
  });

  it('handles missing and invalid input', () => {
    expect(formatDate(null)).toBe('Date not specified');
    expect(formatDate('')).toBe('Date not specified');
    expect(formatDate('not-a-date')).toBe('Date not specified');
  });
});

describe('getDeadlineInfo', () => {
  it('returns null when there is no deadline or it is far out', () => {
    expect(getDeadlineInfo(null)).toBeNull();
    expect(getDeadlineInfo('nonsense')).toBeNull();
    expect(getDeadlineInfo(daysFromToday(30))).toBeNull();
  });

  it('flags a passed deadline as closed', () => {
    expect(getDeadlineInfo(daysFromToday(-1))).toEqual({
      label: 'Closed',
      urgency: 'closed',
      isClosed: true,
    });
  });

  it('flags imminent deadlines as urgent', () => {
    expect(getDeadlineInfo(daysFromToday(0)).label).toBe('Closes today');
    expect(getDeadlineInfo(daysFromToday(1)).label).toBe('Closes tomorrow');
    expect(getDeadlineInfo(daysFromToday(3))).toEqual({
      label: 'Closes in 3 days',
      urgency: 'urgent',
      isClosed: false,
    });
  });

  it('flags deadlines within a week as a warning', () => {
    expect(getDeadlineInfo(daysFromToday(6))).toEqual({
      label: 'Closes in 6 days',
      urgency: 'warning',
      isClosed: false,
    });
  });
});
