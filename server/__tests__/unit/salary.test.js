const {
  normalizeSalaryFrequency,
  annualizeSalary,
  deriveAnnualSalary,
} = require('../../helpers/salary');

describe('normalizeSalaryFrequency', () => {
  it('accepts the bare forms real feeds actually emit', () => {
    // NYPL's Pinpoint feed sends "hour"/"year"; a check for "hourly"/"yearly"
    // matched neither, so hourly postings were stored and shown as Annual.
    expect(normalizeSalaryFrequency('hour')).toBe('Hourly');
    expect(normalizeSalaryFrequency('year')).toBe('Annual');
    expect(normalizeSalaryFrequency('hourly')).toBe('Hourly');
    expect(normalizeSalaryFrequency('yearly')).toBe('Annual');
    expect(normalizeSalaryFrequency('Annually')).toBe('Annual');
    expect(normalizeSalaryFrequency('bi-weekly')).toBe('Bi-Weekly');
  });

  it('is case and whitespace insensitive, and passes canonical values through', () => {
    expect(normalizeSalaryFrequency('  HOURLY ')).toBe('Hourly');
    expect(normalizeSalaryFrequency('Annual')).toBe('Annual');
  });

  it('returns null for nothing usable rather than guessing', () => {
    expect(normalizeSalaryFrequency(null)).toBeNull();
    expect(normalizeSalaryFrequency('')).toBeNull();
    expect(normalizeSalaryFrequency('per fortnight-ish')).toBeNull();
  });
});

describe('annualizeSalary', () => {
  it('converts each period onto one comparable scale', () => {
    expect(annualizeSalary(95, 'Hourly')).toBe(197600); // 95 * 2080
    expect(annualizeSalary(500, 'Daily')).toBe(130000);
    expect(annualizeSalary(2000, 'Bi-Weekly')).toBe(52000);
    expect(annualizeSalary(5000, 'Monthly')).toBe(60000);
    expect(annualizeSalary(90000, 'Annual')).toBe(90000);
  });

  it('normalizes the frequency on the way in', () => {
    expect(annualizeSalary(17, 'hour')).toBe(35360);
    expect(annualizeSalary(80000, 'year')).toBe(80000);
  });

  it('falls back to magnitude when no frequency is recorded', () => {
    expect(annualizeSalary(22.5, null)).toBe(46800); // reads as hourly
    expect(annualizeSalary(75000, null)).toBe(75000); // reads as annual
  });

  it('returns null for anything unusable, so it never sorts as if it paid zero', () => {
    expect(annualizeSalary(null, 'Annual')).toBeNull();
    expect(annualizeSalary(0, 'Annual')).toBeNull();
    expect(annualizeSalary(-5, 'Annual')).toBeNull();
    expect(annualizeSalary('not a number', 'Annual')).toBeNull();
    expect(annualizeSalary(undefined, undefined)).toBeNull();
  });
});

describe('deriveAnnualSalary', () => {
  it('fills both annual columns and canonicalises the frequency', () => {
    const job = { salaryRangeFrom: 95, salaryRangeTo: 120, salaryFrequency: 'hour' };
    deriveAnnualSalary(job);

    expect(job.salaryFrequency).toBe('Hourly');
    expect(job.annualSalaryFrom).toBe(197600);
    expect(job.annualSalaryTo).toBe(249600);
    // The advertised figures are untouched — the UI still shows "$95 Hourly"
    expect(job.salaryRangeFrom).toBe(95);
    expect(job.salaryRangeTo).toBe(120);
  });

  it('leaves an unsalaried job with null annual columns', () => {
    const job = { salaryRangeFrom: null, salaryRangeTo: null, salaryFrequency: null };
    deriveAnnualSalary(job);
    expect(job.annualSalaryFrom).toBeNull();
    expect(job.annualSalaryTo).toBeNull();
  });

  it('handles an open-ended range', () => {
    const job = { salaryRangeFrom: 60000, salaryRangeTo: null, salaryFrequency: 'Annual' };
    deriveAnnualSalary(job);
    expect(job.annualSalaryFrom).toBe(60000);
    expect(job.annualSalaryTo).toBeNull();
  });
});
