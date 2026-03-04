const {
  cleanText,
  cleanJobFields,
  formatJobDescription,
  deduplicateJobs,
  filterJobs,
  sortJobs,
  transformNycJob,
  transformUsaJob,
  transformAdzunaJob,
  getUserSaveEntry,
  escCsv,
} = require('../../helpers/jobHelpers');
const { nycApiJob, nycApiJobsList, usaJobsSearchResultItem, adzunaApiJob } = require('../helpers/fixtures');

// decodeHtmlEntities is not exported, but it is exercised through cleanText.
// We test it indirectly below plus add a focused describe block via cleanText.

// ---------------------------------------------------------------------------
// decodeHtmlEntities (tested through cleanText since it's not exported)
// ---------------------------------------------------------------------------
describe('decodeHtmlEntities (via cleanText)', () => {
  it('decodes &amp; to &', () => {
    expect(cleanText('Tom &amp; Jerry')).toBe('Tom & Jerry');
  });

  it('decodes &lt; and &gt;', () => {
    expect(cleanText('a &lt; b &gt; c')).toBe('a < b > c');
  });

  it('decodes &rsquo; to a right single curly quote', () => {
    expect(cleanText('it&rsquo;s')).toBe('it\u2019s');
  });

  it('decodes &mdash; to an em-dash', () => {
    expect(cleanText('hello&mdash;world')).toBe('hello\u2014world');
  });

  it('decodes &ndash; to an en-dash', () => {
    expect(cleanText('2020&ndash;2025')).toBe('2020\u20132025');
  });

  it('decodes &ldquo; and &rdquo; to curly double quotes', () => {
    expect(cleanText('&ldquo;hello&rdquo;')).toBe('\u201chello\u201d');
  });

  it('decodes &#39; to single quote', () => {
    expect(cleanText('it&#39;s')).toBe("it's");
  });

  it('decodes &nbsp; to a regular space', () => {
    expect(cleanText('hello&nbsp;world')).toBe('hello world');
  });

  it('decodes &bull; and &bullet; to bullet character', () => {
    expect(cleanText('&bull; item')).toBe('\u2022 item');
    expect(cleanText('&bullet; item')).toBe('\u2022 item');
  });

  it('returns unknown entities unchanged', () => {
    expect(cleanText('&unknown;')).toBe('&unknown;');
    expect(cleanText('&foobar;')).toBe('&foobar;');
  });

  it('handles text with no entities', () => {
    expect(cleanText('plain text')).toBe('plain text');
  });

  it('decodes multiple entities in the same string', () => {
    expect(cleanText('a &amp; b &lt; c &gt; d')).toBe('a & b < c > d');
  });
});

// ---------------------------------------------------------------------------
// cleanText
// ---------------------------------------------------------------------------
describe('cleanText', () => {
  it('returns null for null input', () => {
    expect(cleanText(null)).toBeNull();
  });

  it('returns undefined for undefined input', () => {
    expect(cleanText(undefined)).toBeUndefined();
  });

  it('returns empty string for empty string input', () => {
    expect(cleanText('')).toBe('');
  });

  it('decodes HTML entities', () => {
    expect(cleanText('Technology, Data &amp; Innovation')).toBe('Technology, Data & Innovation');
  });

  it('fixes double-encoded smart single quotes (\u00e2\u0080\u0099)', () => {
    expect(cleanText('\u00e2\u0080\u0099')).toBe("'");
  });

  it('fixes double-encoded smart left single quotes (\u00e2\u0080\u0098)', () => {
    expect(cleanText('\u00e2\u0080\u0098')).toBe("'");
  });

  it('fixes double-encoded smart double quotes', () => {
    expect(cleanText('\u00e2\u0080\u009c')).toBe('"');
    expect(cleanText('\u00e2\u0080\u009d')).toBe('"');
  });

  it('fixes double-encoded en-dash (\u00e2\u0080\u0093)', () => {
    expect(cleanText('\u00e2\u0080\u0093')).toBe('-');
  });

  it('fixes double-encoded em-dash (\u00e2\u0080\u0094)', () => {
    expect(cleanText('\u00e2\u0080\u0094')).toBe('-');
  });

  it('fixes double-encoded ellipsis (\u00e2\u0080\u00a6)', () => {
    expect(cleanText('\u00e2\u0080\u00a6')).toBe('...');
  });

  it('fixes double-encoded bullet (\u00e2\u0080\u00a2)', () => {
    expect(cleanText('\u00e2\u0080\u00a2')).toBe('\u2022');
  });

  it('fixes double-encoded non-breaking space (\u00c2\u00a0)', () => {
    expect(cleanText('hello\u00c2\u00a0world')).toBe('hello world');
  });

  it('fixes double-encoded copyright symbol (\u00c2\u00a9)', () => {
    expect(cleanText('\u00c2\u00a9')).toBe('\u00a9');
  });

  it('fixes double-encoded registered symbol (\u00c2\u00ae)', () => {
    expect(cleanText('\u00c2\u00ae')).toBe('\u00ae');
  });

  it('fixes double-encoded degree symbol (\u00c2\u00b0)', () => {
    expect(cleanText('\u00c2\u00b0')).toBe('\u00b0');
  });

  it('fixes double-encoded plus-minus symbol (\u00c2\u00b1)', () => {
    expect(cleanText('\u00c2\u00b1')).toBe('\u00b1');
  });

  it('fixes double-encoded fraction symbols', () => {
    expect(cleanText('\u00c2\u00bc')).toBe('\u00bc');
    expect(cleanText('\u00c2\u00bd')).toBe('\u00bd');
    expect(cleanText('\u00c2\u00be')).toBe('\u00be');
  });

  it('converts multiple consecutive spaces to <br><br>', () => {
    expect(cleanText('hello    world')).toBe('hello<br><br>world');
  });

  it('handles combined HTML entities and double-encoded UTF-8', () => {
    const input = 'Bachelor&rsquo;s degree \u00e2\u0080\u0093 required';
    const result = cleanText(input);
    expect(result).toBe("Bachelor\u2019s degree - required");
  });

  it('preserves normal single-space text', () => {
    expect(cleanText('hello world')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// formatJobDescription
// ---------------------------------------------------------------------------
describe('formatJobDescription', () => {
  it('returns null for null input', () => {
    expect(formatJobDescription(null)).toBeNull();
  });

  it('returns undefined for undefined input', () => {
    expect(formatJobDescription(undefined)).toBeUndefined();
  });

  it('applies cleanText to the input', () => {
    expect(formatJobDescription('Data &amp; Analysis')).toBe('Data & Analysis');
  });

  it('inserts newlines before Work Location:', () => {
    const input = 'Some text Work Location: Manhattan';
    const result = formatJobDescription(input);
    expect(result).toContain('\n\nWork Location:');
  });

  it('inserts newlines before Additional Information:', () => {
    const input = 'Some text Additional Information: details';
    const result = formatJobDescription(input);
    expect(result).toContain('\n\nAdditional Information:');
  });

  it('inserts newlines before To Apply:', () => {
    const input = 'Description To Apply: submit online';
    const result = formatJobDescription(input);
    expect(result).toContain('\n\nTo Apply:');
  });

  it('inserts newlines before Hours/Shift:', () => {
    const input = 'Description Hours/Shift: 9am-5pm';
    const result = formatJobDescription(input);
    expect(result).toContain('\n\nHours/Shift:');
  });

  it('inserts newline before digit + Hours/ pattern', () => {
    const input = 'Full-time 35 Hours/ week';
    const result = formatJobDescription(input);
    expect(result).toContain('\n35 Hours/');
  });

  it('collapses triple newlines into double', () => {
    const input = 'First\n\n\n\n\nSecond';
    const result = formatJobDescription(input);
    expect(result).not.toContain('\n\n\n');
  });

  it('trims whitespace from result', () => {
    const input = '  hello world  ';
    const result = formatJobDescription(input);
    expect(result).toBe(result.trim());
  });
});

// ---------------------------------------------------------------------------
// cleanJobFields
// ---------------------------------------------------------------------------
describe('cleanJobFields', () => {
  it('cleans all TEXT_FIELDS on a raw NYC API job', () => {
    const result = cleanJobFields(nycApiJob);
    // The fixture has &amp; in job_category and agency
    expect(result.job_category).toBe('Technology, Data & Innovation');
    expect(result.agency).toBe('Dept of Info Tech & Telecomm');
    // &rsquo; in minimum_qual_requirements
    expect(result.minimum_qual_requirements).toBe("Bachelor\u2019s degree in Computer Science");
  });

  it('does not modify non-text fields', () => {
    const result = cleanJobFields(nycApiJob);
    expect(result.job_id).toBe(nycApiJob.job_id);
    expect(result.salary_range_from).toBe(nycApiJob.salary_range_from);
    expect(result.salary_range_to).toBe(nycApiJob.salary_range_to);
    expect(result.salary_frequency).toBe(nycApiJob.salary_frequency);
    expect(result.posting_date).toBe(nycApiJob.posting_date);
    expect(result.full_time_part_time_indicator).toBe(nycApiJob.full_time_part_time_indicator);
    expect(result.level).toBe(nycApiJob.level);
  });

  it('handles missing text fields gracefully', () => {
    const job = { job_id: '1', business_title: 'Test &amp; Job' };
    const result = cleanJobFields(job);
    expect(result.business_title).toBe('Test & Job');
    expect(result.job_description).toBeUndefined();
    expect(result.preferred_skills).toBeUndefined();
  });

  it('does not mutate the original object', () => {
    const original = { ...nycApiJob };
    cleanJobFields(original);
    expect(original.job_category).toBe(nycApiJob.job_category);
  });
});

// ---------------------------------------------------------------------------
// deduplicateJobs
// ---------------------------------------------------------------------------
describe('deduplicateJobs', () => {
  it('removes duplicate jobs by job_id', () => {
    const jobs = [
      { job_id: '1', title: 'First' },
      { job_id: '1', title: 'Duplicate' },
      { job_id: '2', title: 'Second' },
    ];
    const result = deduplicateJobs(jobs);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('First');
    expect(result[1].title).toBe('Second');
  });

  it('keeps jobs without job_id (does not filter them out)', () => {
    const jobs = [
      { job_id: '1', title: 'Has ID' },
      { title: 'No ID' },
      { job_id: undefined, title: 'Undefined ID' },
      { job_id: null, title: 'Null ID' },
      { job_id: '', title: 'Empty ID' },
    ];
    const result = deduplicateJobs(jobs);
    expect(result).toHaveLength(5);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateJobs([])).toEqual([]);
  });

  it('preserves order of first-seen items', () => {
    const jobs = [
      { job_id: '3', title: 'Third' },
      { job_id: '1', title: 'First' },
      { job_id: '2', title: 'Second' },
      { job_id: '1', title: 'First Dupe' },
    ];
    const result = deduplicateJobs(jobs);
    expect(result.map((j) => j.job_id)).toEqual(['3', '1', '2']);
  });

  it('handles all unique jobs without removing any', () => {
    const jobs = [
      { job_id: 'a', title: 'A' },
      { job_id: 'b', title: 'B' },
      { job_id: 'c', title: 'C' },
    ];
    const result = deduplicateJobs(jobs);
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// filterJobs
// ---------------------------------------------------------------------------
describe('filterJobs', () => {
  const jobs = nycApiJobsList;

  it('returns all jobs when no filters are provided', () => {
    const result = filterJobs(jobs, {});
    expect(result).toHaveLength(jobs.length);
  });

  it('filters by keyword q (case-insensitive) across business_title', () => {
    const result = filterJobs(jobs, { q: 'software' });
    expect(result).toHaveLength(1);
    expect(result[0].business_title).toBe('Software Developer');
  });

  it('filters by keyword q across job_description', () => {
    const result = filterJobs(jobs, { q: 'build applications' });
    // All three jobs share the same job_description from the fixture spread
    expect(result.length).toBeGreaterThan(0);
    result.forEach((job) => {
      expect(job.job_description.toLowerCase()).toContain('build applications');
    });
  });

  it('filters by keyword q across agency', () => {
    const result = filterJobs(jobs, { q: 'Education' });
    expect(result).toHaveLength(1);
    expect(result[0].agency).toBe('Dept of Education');
  });

  it('filters by keyword q across job_category', () => {
    const result = filterJobs(jobs, { q: 'Policy' });
    expect(result).toHaveLength(1);
    expect(result[0].job_id).toBe('12346');
  });

  it('filters by keyword q case-insensitively', () => {
    const result = filterJobs(jobs, { q: 'DATA ANALYST' });
    expect(result).toHaveLength(1);
    expect(result[0].business_title).toBe('Data Analyst');
  });

  it('filters by category (exact match, case-insensitive)', () => {
    const result = filterJobs(jobs, { category: 'Technology, Data &amp; Innovation' });
    expect(result).toHaveLength(1);
    expect(result[0].job_id).toBe('12345');
  });

  it('filters by location (partial match)', () => {
    const result = filterJobs(jobs, { location: 'brook' });
    expect(result).toHaveLength(1);
    expect(result[0].work_location).toBe('Brooklyn');
  });

  it('filters by agency (partial match)', () => {
    const result = filterJobs(jobs, { agency: 'Health' });
    expect(result).toHaveLength(1);
    expect(result[0].agency).toBe('Dept of Health');
  });

  it('filters by salary_min', () => {
    const result = filterJobs(jobs, { salary_min: '70000' });
    // salary_range_from >= 70000: only job 12347 has 80000
    expect(result).toHaveLength(1);
    expect(result[0].job_id).toBe('12347');
  });

  it('filters by salary_max', () => {
    const result = filterJobs(jobs, { salary_max: '80000' });
    // salary_range_to <= 80000: 12346 (75000)
    expect(result).toHaveLength(1);
    expect(result[0].job_id).toBe('12346');
  });

  it('handles combined filters', () => {
    const result = filterJobs(jobs, { q: 'analyst', location: 'Brooklyn' });
    expect(result).toHaveLength(1);
    expect(result[0].job_id).toBe('12346');
  });

  it('returns empty array when nothing matches', () => {
    const result = filterJobs(jobs, { q: 'zzzznonexistent' });
    expect(result).toEqual([]);
  });

  it('handles jobs with null fields without crashing', () => {
    const jobsWithNulls = [
      { job_id: '1', business_title: null, job_description: null, agency: null },
    ];
    const result = filterJobs(jobsWithNulls, { q: 'test' });
    expect(result).toEqual([]);
  });

  it('ignores non-numeric salary_min', () => {
    const result = filterJobs(jobs, { salary_min: 'abc' });
    // isNaN(NaN) -> true so filter is skipped
    expect(result).toHaveLength(jobs.length);
  });

  it('ignores non-numeric salary_max', () => {
    const result = filterJobs(jobs, { salary_max: 'abc' });
    expect(result).toHaveLength(jobs.length);
  });
});

// ---------------------------------------------------------------------------
// getSalaryValue
// ---------------------------------------------------------------------------
// getSalaryValue is not exported, but we can test it through sortJobs behavior.
// We also replicate the function logic here for isolated testing.
describe('getSalaryValue (internal, tested via sort behavior)', () => {
  // Replicate the function for focused unit tests
  const getSalaryValue = (job) => {
    const from = parseInt(job.salary_range_from);
    const to = parseInt(job.salary_range_to);
    if (!from || !to || isNaN(from) || isNaN(to)) return null;
    return Math.round((from + to) / 2);
  };

  it('returns midpoint of salary range', () => {
    expect(getSalaryValue({ salary_range_from: '60000', salary_range_to: '80000' })).toBe(70000);
  });

  it('returns null when salary_range_from is missing', () => {
    expect(getSalaryValue({ salary_range_to: '80000' })).toBeNull();
  });

  it('returns null when salary_range_to is missing', () => {
    expect(getSalaryValue({ salary_range_from: '60000' })).toBeNull();
  });

  it('returns null for NaN values', () => {
    expect(getSalaryValue({ salary_range_from: 'abc', salary_range_to: '80000' })).toBeNull();
    expect(getSalaryValue({ salary_range_from: '60000', salary_range_to: 'xyz' })).toBeNull();
  });

  it('returns null for zero values (falsy via !from)', () => {
    // parseInt('0') === 0, and !0 === true, so it returns null
    expect(getSalaryValue({ salary_range_from: '0', salary_range_to: '80000' })).toBeNull();
    expect(getSalaryValue({ salary_range_from: '60000', salary_range_to: '0' })).toBeNull();
  });

  it('rounds midpoint when not an integer', () => {
    expect(getSalaryValue({ salary_range_from: '50001', salary_range_to: '50002' })).toBe(50002);
  });
});

// ---------------------------------------------------------------------------
// sortJobs
// ---------------------------------------------------------------------------
describe('sortJobs', () => {
  const jobs = [
    {
      job_id: '1',
      business_title: 'Banana',
      posting_date: '2025-02-01T00:00:00.000',
      salary_range_from: '60000',
      salary_range_to: '80000',
    },
    {
      job_id: '2',
      business_title: 'Apple',
      posting_date: '2025-03-01T00:00:00.000',
      salary_range_from: '90000',
      salary_range_to: '110000',
    },
    {
      job_id: '3',
      business_title: 'Cherry',
      posting_date: '2025-01-01T00:00:00.000',
      salary_range_from: '40000',
      salary_range_to: '50000',
    },
  ];

  it('sorts by date_desc (default) -- most recent first', () => {
    const result = sortJobs(jobs, 'date_desc');
    expect(result.map((j) => j.job_id)).toEqual(['2', '1', '3']);
  });

  it('uses date_desc as default when sort is undefined', () => {
    const result = sortJobs(jobs, undefined);
    expect(result.map((j) => j.job_id)).toEqual(['2', '1', '3']);
  });

  it('sorts by date_asc -- oldest first', () => {
    const result = sortJobs(jobs, 'date_asc');
    expect(result.map((j) => j.job_id)).toEqual(['3', '1', '2']);
  });

  it('sorts by title_asc -- alphabetical', () => {
    const result = sortJobs(jobs, 'title_asc');
    expect(result.map((j) => j.business_title)).toEqual(['Apple', 'Banana', 'Cherry']);
  });

  it('sorts by title_desc -- reverse alphabetical', () => {
    const result = sortJobs(jobs, 'title_desc');
    expect(result.map((j) => j.business_title)).toEqual(['Cherry', 'Banana', 'Apple']);
  });

  it('sorts by salary_desc -- highest midpoint first', () => {
    const result = sortJobs(jobs, 'salary_desc');
    // Midpoints: job2=100k, job1=70k, job3=45k
    expect(result.map((j) => j.job_id)).toEqual(['2', '1', '3']);
  });

  it('sorts by salary_asc -- lowest midpoint first', () => {
    const result = sortJobs(jobs, 'salary_asc');
    expect(result.map((j) => j.job_id)).toEqual(['3', '1', '2']);
  });

  it('pushes null salary to end in salary_desc', () => {
    const jobsWithNull = [
      ...jobs,
      { job_id: '4', business_title: 'NoSalary', posting_date: '2025-04-01' },
    ];
    const result = sortJobs(jobsWithNull, 'salary_desc');
    expect(result[result.length - 1].job_id).toBe('4');
  });

  it('pushes null salary to end in salary_asc', () => {
    const jobsWithNull = [
      { job_id: '4', business_title: 'NoSalary', posting_date: '2025-04-01' },
      ...jobs,
    ];
    const result = sortJobs(jobsWithNull, 'salary_asc');
    expect(result[result.length - 1].job_id).toBe('4');
  });

  it('does not mutate the original array', () => {
    const original = [...jobs];
    sortJobs(jobs, 'title_asc');
    expect(jobs.map((j) => j.job_id)).toEqual(original.map((j) => j.job_id));
  });

  it('handles missing posting_date (treated as epoch 0)', () => {
    const jobsMissingDate = [
      { job_id: '1', posting_date: '2025-01-01' },
      { job_id: '2' },
    ];
    const result = sortJobs(jobsMissingDate, 'date_desc');
    expect(result[0].job_id).toBe('1');
    expect(result[1].job_id).toBe('2');
  });

  it('handles missing posting_date in date_asc', () => {
    const jobsMissingDate = [
      { job_id: '1', posting_date: '2025-01-01' },
      { job_id: '2' },
    ];
    const result = sortJobs(jobsMissingDate, 'date_asc');
    expect(result[0].job_id).toBe('2'); // epoch 0 is earliest
    expect(result[1].job_id).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// transformNycJob
// ---------------------------------------------------------------------------
describe('transformNycJob', () => {
  it('maps snake_case fields to camelCase', () => {
    const result = transformNycJob(nycApiJob);
    expect(result.jobId).toBe('12345');
    expect(result.businessTitle).toBe('Software Developer');
    expect(result.civilServiceTitle).toBe('Computer Specialist');
    expect(result.titleCodeNo).toBe('10050');
    expect(result.level).toBe('02');
    expect(result.fullTimePartTimeIndicator).toBe('F');
    expect(result.salaryRangeFrom).toBe('65000');
    expect(result.salaryRangeTo).toBe('95000');
    expect(result.salaryFrequency).toBe('Annual');
    expect(result.workLocation).toBe('Manhattan');
    expect(result.workLocation1).toBe('100 Church St., New York, NY');
    expect(result.divisionWorkUnit).toBe('DoITT');
    expect(result.postDate).toBe('2025-01-15T00:00:00.000');
    expect(result.processDate).toBe('2025-01-20T00:00:00.000');
    expect(result.postUntil).toBe('2025-03-15T00:00:00.000');
  });

  it('does NOT clean text when clean option is false (default)', () => {
    const result = transformNycJob(nycApiJob);
    // The fixture has &amp; in job_category -- should be left as-is
    expect(result.jobCategory).toBe('Technology, Data &amp; Innovation');
    expect(result.agency).toBe('Dept of Info Tech &amp; Telecomm');
  });

  it('cleans text when clean option is true', () => {
    const result = transformNycJob(nycApiJob, { clean: true });
    expect(result.jobCategory).toBe('Technology, Data & Innovation');
    expect(result.agency).toBe('Dept of Info Tech & Telecomm');
    expect(result.minimumQualRequirements).toBe("Bachelor\u2019s degree in Computer Science");
  });

  it('applies formatJobDescription to jobDescription when clean is true', () => {
    const jobWithDesc = {
      ...nycApiJob,
      job_description: 'Hello &amp; World Work Location: Manhattan',
    };
    const result = transformNycJob(jobWithDesc, { clean: true });
    expect(result.jobDescription).toContain('Hello & World');
    expect(result.jobDescription).toContain('\n\nWork Location:');
  });

  it('handles missing fields gracefully', () => {
    const minimalJob = { job_id: '999' };
    const result = transformNycJob(minimalJob);
    expect(result.jobId).toBe('999');
    expect(result.businessTitle).toBeUndefined();
    expect(result.agency).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// transformUsaJob
// ---------------------------------------------------------------------------
describe('transformUsaJob', () => {
  it('maps USAJobs response fields to camelCase', () => {
    const result = transformUsaJob(usaJobsSearchResultItem);
    expect(result.jobId).toBe('USA-12345');
    expect(result.source).toBe('federal');
    expect(result.businessTitle).toBe('IT Specialist');
    expect(result.civilServiceTitle).toBeNull();
    expect(result.titleCodeNo).toBeNull();
    expect(result.level).toBe('GS-12');
    expect(result.jobCategory).toBe('Information Technology');
    expect(result.fullTimePartTimeIndicator).toBe('Full-Time');
    expect(result.salaryRangeFrom).toBe(78000);
    expect(result.salaryRangeTo).toBe(101000);
    expect(result.salaryFrequency).toBe('Annual');
    expect(result.workLocation).toBe('New York, New York');
    expect(result.divisionWorkUnit).toBe('Department of Homeland Security');
    expect(result.agency).toBe('TSA');
    expect(result.postDate).toBe('2025-01-20');
    expect(result.postUntil).toBe('2025-03-20');
    expect(result.toApply).toBe('https://www.usajobs.gov/apply/USA-12345');
    expect(result.externalUrl).toBe('https://www.usajobs.gov/apply/USA-12345');
    expect(result.additionalInformation).toBe("Bachelor's degree required");
  });

  it('returns null when MatchedObjectDescriptor is missing', () => {
    expect(transformUsaJob({})).toBeNull();
    expect(transformUsaJob({ MatchedObjectId: '123' })).toBeNull();
  });

  it('returns null when input is null or undefined', () => {
    expect(transformUsaJob(null)).toBeNull();
    expect(transformUsaJob(undefined)).toBeNull();
  });

  it('maps PA frequency to Annual', () => {
    const result = transformUsaJob(usaJobsSearchResultItem);
    expect(result.salaryFrequency).toBe('Annual');
  });

  it('maps PH frequency to Hourly', () => {
    const item = JSON.parse(JSON.stringify(usaJobsSearchResultItem));
    item.MatchedObjectDescriptor.PositionRemuneration[0].RateIntervalCode = 'PH';
    const result = transformUsaJob(item);
    expect(result.salaryFrequency).toBe('Hourly');
  });

  it('maps PD frequency to Daily', () => {
    const item = JSON.parse(JSON.stringify(usaJobsSearchResultItem));
    item.MatchedObjectDescriptor.PositionRemuneration[0].RateIntervalCode = 'PD';
    const result = transformUsaJob(item);
    expect(result.salaryFrequency).toBe('Daily');
  });

  it('maps PW frequency to Bi-Weekly', () => {
    const item = JSON.parse(JSON.stringify(usaJobsSearchResultItem));
    item.MatchedObjectDescriptor.PositionRemuneration[0].RateIntervalCode = 'PW';
    const result = transformUsaJob(item);
    expect(result.salaryFrequency).toBe('Bi-Weekly');
  });

  it('maps PM frequency to Monthly', () => {
    const item = JSON.parse(JSON.stringify(usaJobsSearchResultItem));
    item.MatchedObjectDescriptor.PositionRemuneration[0].RateIntervalCode = 'PM';
    const result = transformUsaJob(item);
    expect(result.salaryFrequency).toBe('Monthly');
  });

  it('falls back to raw RateIntervalCode for unknown codes', () => {
    const item = JSON.parse(JSON.stringify(usaJobsSearchResultItem));
    item.MatchedObjectDescriptor.PositionRemuneration[0].RateIntervalCode = 'XX';
    const result = transformUsaJob(item);
    expect(result.salaryFrequency).toBe('XX');
  });

  it('concatenates JobSummary and MajorDuties into jobDescription', () => {
    const result = transformUsaJob(usaJobsSearchResultItem);
    expect(result.jobDescription).toContain('Responsible for IT systems and infrastructure.');
    expect(result.jobDescription).toContain('Manages networks and security.');
    expect(result.jobDescription).toContain('\n\n');
  });

  it('falls back to QualificationSummary when JobSummary and MajorDuties are missing', () => {
    const item = JSON.parse(JSON.stringify(usaJobsSearchResultItem));
    delete item.MatchedObjectDescriptor.UserArea.Details.JobSummary;
    delete item.MatchedObjectDescriptor.UserArea.Details.MajorDuties;
    const result = transformUsaJob(item);
    expect(result.jobDescription).toBe('Must have IT experience...');
  });

  it('handles missing nested fields gracefully', () => {
    const minimalItem = {
      MatchedObjectId: 'MIN-1',
      MatchedObjectDescriptor: {
        PositionTitle: 'Minimal Job',
      },
    };
    const result = transformUsaJob(minimalItem);
    expect(result.jobId).toBe('MIN-1');
    expect(result.businessTitle).toBe('Minimal Job');
    expect(result.level).toBeNull();
    expect(result.jobCategory).toBeNull();
    expect(result.fullTimePartTimeIndicator).toBeNull();
    expect(result.salaryRangeFrom).toBeNull();
    expect(result.salaryRangeTo).toBeNull();
    expect(result.salaryFrequency).toBeNull();
    expect(result.workLocation).toBeNull();
    expect(result.divisionWorkUnit).toBeNull();
    expect(result.agency).toBeNull();
    expect(result.toApply).toBeNull();
    expect(result.hoursShift).toBeNull();
    expect(result.workLocation1).toBeNull();
    expect(result.jobDescription).toBe('');
  });

  it('handles missing UserArea entirely', () => {
    const item = JSON.parse(JSON.stringify(usaJobsSearchResultItem));
    delete item.MatchedObjectDescriptor.UserArea;
    const result = transformUsaJob(item);
    expect(result.additionalInformation).toBeNull();
    // Falls back to QualificationSummary for description
    expect(result.jobDescription).toBe('Must have IT experience...');
  });
});

// ---------------------------------------------------------------------------
// transformAdzunaJob
// ---------------------------------------------------------------------------
describe('transformAdzunaJob', () => {
  it('maps Adzuna response fields to camelCase', () => {
    const result = transformAdzunaJob(adzunaApiJob);
    expect(result.jobId).toBe('4567890123');
    expect(result.source).toBe('adzuna');
    expect(result.businessTitle).toBe('Senior Software Engineer');
    expect(result.agency).toBe('Acme Corp');
    expect(result.workLocation).toBe('New York, NY');
    expect(result.salaryRangeFrom).toBe(120000);
    expect(result.salaryRangeTo).toBe(160000);
    expect(result.salaryFrequency).toBe('Annual');
    expect(result.jobCategory).toBe('IT Jobs');
    expect(result.jobDescription).toBe('We are looking for a senior software engineer to join our team.');
    expect(result.toApply).toBe('https://www.adzuna.com/details/4567890123');
    expect(result.externalUrl).toBe('https://www.adzuna.com/details/4567890123');
    expect(result.postDate).toBe('2025-02-10T12:00:00Z');
    expect(result.fullTimePartTimeIndicator).toBe('full_time');
    expect(result.divisionWorkUnit).toBe('Acme Corp');
  });

  it('returns null when input is null', () => {
    expect(transformAdzunaJob(null)).toBeNull();
  });

  it('returns null when input is undefined', () => {
    expect(transformAdzunaJob(undefined)).toBeNull();
  });

  it('handles missing nested fields gracefully', () => {
    const minimalJob = { id: 999, title: 'Minimal' };
    const result = transformAdzunaJob(minimalJob);
    expect(result.jobId).toBe('999');
    expect(result.businessTitle).toBe('Minimal');
    expect(result.agency).toBeNull();
    expect(result.workLocation).toBeNull();
    expect(result.salaryRangeFrom).toBeNull();
    expect(result.salaryRangeTo).toBeNull();
    expect(result.jobCategory).toBeNull();
    expect(result.toApply).toBeNull();
    expect(result.externalUrl).toBeNull();
  });

  it('rounds salary values', () => {
    const job = { ...adzunaApiJob, salary_min: 75432.67, salary_max: 98765.43 };
    const result = transformAdzunaJob(job);
    expect(result.salaryRangeFrom).toBe(75433);
    expect(result.salaryRangeTo).toBe(98765);
  });

  it('sets NYC-specific fields to null', () => {
    const result = transformAdzunaJob(adzunaApiJob);
    expect(result.civilServiceTitle).toBeNull();
    expect(result.titleCodeNo).toBeNull();
    expect(result.level).toBeNull();
    expect(result.minimumQualRequirements).toBeNull();
    expect(result.preferredSkills).toBeNull();
    expect(result.additionalInformation).toBeNull();
    expect(result.hoursShift).toBeNull();
    expect(result.workLocation1).toBeNull();
    expect(result.residencyRequirement).toBeNull();
    expect(result.processDate).toBeNull();
    expect(result.postUntil).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getUserSaveEntry
// ---------------------------------------------------------------------------
describe('getUserSaveEntry', () => {
  const userId = 'user123';

  it('returns isSaved:true with fields when user has saved the job', () => {
    const savedAt = new Date('2025-01-01');
    const statusUpdatedAt = new Date('2025-01-02');
    const statusHistory = [{ status: 'interested', changedAt: new Date('2025-01-01') }];
    const job = {
      savedBy: [
        {
          user: userId,
          savedAt,
          applicationStatus: 'applied',
          statusUpdatedAt,
          statusHistory,
        },
      ],
    };
    const result = getUserSaveEntry(job, userId);
    expect(result.isSaved).toBe(true);
    expect(result.applicationStatus).toBe('applied');
    expect(result.savedAt).toEqual(savedAt);
    expect(result.statusUpdatedAt).toEqual(statusUpdatedAt);
    expect(result.statusHistory).toEqual(statusHistory);
  });

  it('defaults applicationStatus to "interested" when not set', () => {
    const job = {
      savedBy: [{ user: userId, savedAt: new Date() }],
    };
    const result = getUserSaveEntry(job, userId);
    expect(result.isSaved).toBe(true);
    expect(result.applicationStatus).toBe('interested');
  });

  it('defaults statusHistory to [] when not set', () => {
    const job = {
      savedBy: [{ user: userId, savedAt: new Date() }],
    };
    const result = getUserSaveEntry(job, userId);
    expect(result.statusHistory).toEqual([]);
  });

  it('returns defaults when user has NOT saved the job', () => {
    const job = {
      savedBy: [{ user: 'otherUser', savedAt: new Date() }],
    };
    const result = getUserSaveEntry(job, userId);
    expect(result.isSaved).toBe(false);
    expect(result.applicationStatus).toBeNull();
    expect(result.savedAt).toBeNull();
    expect(result.statusHistory).toEqual([]);
  });

  it('returns defaults when savedBy is null', () => {
    const job = { savedBy: null };
    // savedBy?.find should return undefined when savedBy is null
    const result = getUserSaveEntry(job, userId);
    expect(result.isSaved).toBe(false);
    expect(result.applicationStatus).toBeNull();
  });

  it('returns defaults when savedBy is undefined', () => {
    const job = {};
    const result = getUserSaveEntry(job, userId);
    expect(result.isSaved).toBe(false);
  });

  it('matches user by toString() comparison (ObjectId-like)', () => {
    // Simulate a Mongoose ObjectId with a toString method
    const objectId = {
      toString() {
        return 'abc123';
      },
    };
    const job = {
      savedBy: [{ user: objectId, savedAt: new Date(), applicationStatus: 'interviewing' }],
    };
    const result = getUserSaveEntry(job, 'abc123');
    expect(result.isSaved).toBe(true);
    expect(result.applicationStatus).toBe('interviewing');
  });

  it('handles empty savedBy array', () => {
    const job = { savedBy: [] };
    const result = getUserSaveEntry(job, userId);
    expect(result.isSaved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// escCsv
// ---------------------------------------------------------------------------
describe('escCsv', () => {
  it('returns empty string for null', () => {
    expect(escCsv(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(escCsv(undefined)).toBe('');
  });

  it('returns the string unchanged when no special characters', () => {
    expect(escCsv('plain text')).toBe('plain text');
  });

  it('wraps value in quotes when it contains a comma', () => {
    expect(escCsv('hello, world')).toBe('"hello, world"');
  });

  it('wraps value in quotes when it contains a newline', () => {
    expect(escCsv('line1\nline2')).toBe('"line1\nline2"');
  });

  it('escapes double quotes by doubling them and wraps in quotes', () => {
    expect(escCsv('say "hello"')).toBe('"say ""hello"""');
  });

  it('handles value with comma and quotes', () => {
    expect(escCsv('"yes", "no"')).toBe('"""yes"", ""no"""');
  });

  it('converts numeric values to string', () => {
    expect(escCsv(42)).toBe('42');
  });

  it('converts zero to string', () => {
    expect(escCsv(0)).toBe('0');
  });

  it('converts boolean to string', () => {
    expect(escCsv(true)).toBe('true');
  });

  it('handles empty string', () => {
    expect(escCsv('')).toBe('');
  });
});
