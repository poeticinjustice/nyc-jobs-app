const { omitUndefined, safeDate, parseSalaryRange } = require('../../scrapers/utils');
const { cleanText, transformNysJob } = require('../../helpers/jobHelpers');

describe('omitUndefined', () => {
  it('strips undefined values but keeps null and falsy values', () => {
    const result = omitUndefined({
      keep: 'value',
      explicitNull: null,
      zero: 0,
      empty: '',
      dropMe: undefined,
    });
    expect(result).toEqual({ keep: 'value', explicitNull: null, zero: 0, empty: '' });
    expect('dropMe' in result).toBe(false);
  });

  it('preserves stored fields in a cached-path $set (the wipe-bug fix)', () => {
    // Simulates a scraper building $set for a cached job: detail-derived
    // fields are undefined and must not reach MongoDB as nulls
    const set = omitUndefined({
      businessTitle: 'Curator',
      postDate: undefined,
      fullTimePartTimeIndicator: undefined,
      lastRefreshedAt: new Date(),
    });
    expect(Object.keys(set)).toEqual(['businessTitle', 'lastRefreshedAt']);
  });
});

describe('safeDate', () => {
  it('parses valid inputs', () => {
    expect(safeDate('2026-07-01')).toEqual(new Date('2026-07-01'));
    expect(safeDate(new Date('2026-01-15'))).toEqual(new Date('2026-01-15'));
    expect(safeDate(1750000000000)).toEqual(new Date(1750000000000));
  });

  it('returns null for garbage instead of an Invalid Date (bulkWrite abort guard)', () => {
    expect(safeDate('30+ days ago')).toBeNull();
    expect(safeDate('Posted Yesterday')).toBeNull();
    expect(safeDate('')).toBeNull();
    expect(safeDate(null)).toBeNull();
    expect(safeDate(undefined)).toBeNull();
  });
});

describe('cleanText scalar mode', () => {
  it('does not inject <br> markers into scalar fields', () => {
    expect(cleanText('Senior  Manager,  External Affairs', false)).toBe(
      'Senior Manager, External Affairs'
    );
  });

  it('still converts space runs to paragraph breaks in long-form mode', () => {
    expect(cleanText('Duties:  see below')).toBe('Duties:<br><br>see below');
  });
});

describe('transformNysJob salary frequency normalization', () => {
  it("normalizes 'Annually' to 'Annual' (matches every other source)", () => {
    const job = transformNysJob({
      'Vacancy ID': '99',
      Title: 'Analyst',
      'Salary Range': 'From $50425 to $61548 Annually',
    });
    expect(job.salaryFrequency).toBe('Annual');
    expect(job.salaryRangeFrom).toBe(50425);
    expect(job.salaryRangeTo).toBe(61548);
  });

  it("keeps 'Hourly' as-is", () => {
    const job = transformNysJob({
      'Vacancy ID': '99',
      Title: 'Aide',
      'Salary Range': 'From $22.59 to $28.10 Hourly',
    });
    expect(job.salaryFrequency).toBe('Hourly');
  });
});

describe('parseSalaryRange frequency inference', () => {
  it('labels large values Annual and small values Hourly when text gives no signal', () => {
    expect(parseSalaryRange('$90,000 - $120,000').frequency).toBe('Annual');
    expect(parseSalaryRange('$28.59 - $38.12').frequency).toBe('Hourly');
  });
});
