/**
 * Salary frequency vocabulary and annualisation.
 *
 * Postings arrive priced per hour, per day, per year and several things in
 * between, and `salaryRangeFrom/To` store whatever unit the source used. That
 * is right for display — a warehouse role should read "$22.00 Hourly" — but it
 * makes the raw columns useless for comparison: filtering `salary_min=100000`
 * against a $95/hour posting (~$198k a year) excluded it, and "Lowest Salary
 * First" sorted a $16/hour role above a $60,000 one.
 *
 * So each job also carries `annualSalaryFrom/To`, computed here at upsert time.
 * Display reads the raw columns; filtering and sorting read the annual ones.
 */

// The canonical set. Everything the scrapers encounter maps into one of these.
const SALARY_FREQUENCIES = [
  'Hourly',
  'Daily',
  'Weekly',
  'Bi-Weekly',
  'Semi-Monthly',
  'Monthly',
  'Annual',
];

// Every spelling seen across the 25 sources. NYPL's Pinpoint feed emits bare
// "hour"/"year", which a check for "hourly"/"yearly" missed entirely — those
// postings were stored as Annual and rendered as "$17.00 Annual".
const FREQUENCY_ALIASES = {
  hour: 'Hourly', hourly: 'Hourly', hr: 'Hourly', 'per hour': 'Hourly', '/hr': 'Hourly',
  day: 'Daily', daily: 'Daily', 'per day': 'Daily',
  week: 'Weekly', weekly: 'Weekly', 'per week': 'Weekly',
  'bi-weekly': 'Bi-Weekly', biweekly: 'Bi-Weekly', 'bi weekly': 'Bi-Weekly', fortnightly: 'Bi-Weekly',
  'semi-monthly': 'Semi-Monthly', semimonthly: 'Semi-Monthly', 'semi monthly': 'Semi-Monthly',
  month: 'Monthly', monthly: 'Monthly', 'per month': 'Monthly',
  year: 'Annual', yearly: 'Annual', annual: 'Annual', annually: 'Annual',
  'per year': 'Annual', 'per annum': 'Annual', pa: 'Annual', salaried: 'Annual',
};

/** Map any source spelling onto the canonical vocabulary, or null if unknown. */
const normalizeSalaryFrequency = (raw) => {
  if (raw === null || raw === undefined) return null;
  const key = String(raw).trim().toLowerCase();
  if (!key) return null;
  if (FREQUENCY_ALIASES[key]) return FREQUENCY_ALIASES[key];
  // Already canonical (e.g. a value read back out of the database)
  const exact = SALARY_FREQUENCIES.find((f) => f.toLowerCase() === key);
  return exact || null;
};

// Pay periods per year. 2080 = 40 hours x 52 weeks, the US full-time
// convention; 260 = 5 days x 52 weeks.
const PERIODS_PER_YEAR = {
  Hourly: 2080,
  Daily: 260,
  Weekly: 52,
  'Bi-Weekly': 26,
  'Semi-Monthly': 24,
  Monthly: 12,
  Annual: 1,
};

/**
 * Convert one salary figure to an annual equivalent.
 *
 * Returns null for anything unusable, so a job with no salary stays absent
 * from the annual columns rather than sorting as if it paid zero.
 */
const annualizeSalary = (amount, frequency) => {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;

  // No usable frequency: fall back to magnitude, the same rule parseSalaryRange
  // applies when the source text carries no unit at all.
  const freq = normalizeSalaryFrequency(frequency) || (n >= 1000 ? 'Annual' : 'Hourly');
  return Math.round(n * PERIODS_PER_YEAR[freq]);
};

/**
 * Derive the annual columns for one job-shaped object, in place.
 *
 * Called from two places because neither covers the other: buildUpsertOps
 * handles the scrapers' bulkWrite path, which Mongoose middleware never sees,
 * and a schema hook handles direct saves (seeds, tests, one-off fixes). The
 * rule itself lives only here so the two cannot drift.
 */
const deriveAnnualSalary = (doc) => {
  const frequency = normalizeSalaryFrequency(doc.salaryFrequency);
  if (frequency) doc.salaryFrequency = frequency;
  doc.annualSalaryFrom = annualizeSalary(doc.salaryRangeFrom, doc.salaryFrequency);
  doc.annualSalaryTo = annualizeSalary(doc.salaryRangeTo, doc.salaryFrequency);
  return doc;
};

module.exports = {
  SALARY_FREQUENCIES,
  PERIODS_PER_YEAR,
  normalizeSalaryFrequency,
  annualizeSalary,
  deriveAnnualSalary,
};
