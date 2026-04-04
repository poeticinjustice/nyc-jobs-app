const { parseSalaryRange } = require('../../scrapers/utils');

// ---------------------------------------------------------------------------
// parseSalaryRange
// ---------------------------------------------------------------------------
describe('parseSalaryRange', () => {
  // --- Null / empty / undefined input ---
  describe('null, empty, and undefined input', () => {
    it('returns nulls for null input', () => {
      expect(parseSalaryRange(null)).toEqual({ from: null, to: null, frequency: null });
    });

    it('returns nulls for undefined input', () => {
      expect(parseSalaryRange(undefined)).toEqual({ from: null, to: null, frequency: null });
    });

    it('returns nulls for empty string', () => {
      expect(parseSalaryRange('')).toEqual({ from: null, to: null, frequency: null });
    });
  });

  // --- No-match text ---
  describe('unrecognized salary text', () => {
    it('returns nulls for "Competitive salary"', () => {
      expect(parseSalaryRange('Competitive salary')).toEqual({ from: null, to: null, frequency: null });
    });

    it('returns nulls for plain text with no dollar amounts', () => {
      expect(parseSalaryRange('Based on experience')).toEqual({ from: null, to: null, frequency: null });
    });
  });

  // --- Standard range ---
  describe('standard annual range', () => {
    it('parses "$50,000 - $70,000" as Annual', () => {
      expect(parseSalaryRange('$50,000 - $70,000')).toEqual({ from: 50000, to: 70000, frequency: 'Annual' });
    });
  });

  // --- USD prefix ---
  describe('USD prefix', () => {
    it('parses "USD $80,000 to USD $100,000" as Annual', () => {
      expect(parseSalaryRange('USD $80,000 to USD $100,000')).toEqual({ from: 80000, to: 100000, frequency: 'Annual' });
    });
  });

  // --- Hourly range ---
  describe('hourly range', () => {
    it('parses "$25.50/hr - $30.00/hr" as Hourly', () => {
      expect(parseSalaryRange('$25.50/hr - $30.00/hr')).toEqual({ from: 25.5, to: 30, frequency: 'Hourly' });
    });
  });

  // --- Annual with /annual suffix ---
  describe('annual with explicit /annual suffix', () => {
    it('parses "$60,000/annual - $80,000/annual" as Annual', () => {
      expect(parseSalaryRange('$60,000/annual - $80,000/annual')).toEqual({ from: 60000, to: 80000, frequency: 'Annual' });
    });
  });

  // --- Frequency inference from magnitude ---
  describe('frequency inference from number magnitude', () => {
    it('defaults to Hourly for small numbers like "$15 - $20"', () => {
      expect(parseSalaryRange('$15 - $20')).toEqual({ from: 15, to: 20, frequency: 'Hourly' });
    });

    it('defaults to Annual for large numbers like "$50,000 - $70,000"', () => {
      expect(parseSalaryRange('$50,000 - $70,000')).toEqual({ from: 50000, to: 70000, frequency: 'Annual' });
    });
  });

  // --- Edge cases ---
  describe('edge cases', () => {
    it('handles en-dash separator', () => {
      expect(parseSalaryRange('$40,000\u2013$60,000')).toEqual({ from: 40000, to: 60000, frequency: 'Annual' });
    });

    it('handles "per hour" text nearby', () => {
      expect(parseSalaryRange('$18 - $22 per hour')).toEqual({ from: 18, to: 22, frequency: 'Hourly' });
    });

    it('handles "per year" text nearby', () => {
      expect(parseSalaryRange('$55,000 - $75,000 per year')).toEqual({ from: 55000, to: 75000, frequency: 'Annual' });
    });

    it('handles "yearly" text nearby', () => {
      expect(parseSalaryRange('$55,000 - $75,000 yearly')).toEqual({ from: 55000, to: 75000, frequency: 'Annual' });
    });

    it('threshold: $999 defaults to Hourly', () => {
      expect(parseSalaryRange('$999 - $1500')).toEqual({ from: 999, to: 1500, frequency: 'Hourly' });
    });

    it('threshold: $1000 defaults to Annual', () => {
      expect(parseSalaryRange('$1000 - $1500')).toEqual({ from: 1000, to: 1500, frequency: 'Annual' });
    });
  });
});
