// Shared helpers for job data transformation, filtering, sorting, and deduplication

// HTML entity decoder
const decodeHtmlEntities = (text) => {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&mdash;': '\u2014',
    '&ndash;': '\u2013',
    '&hellip;': '\u2026',
    '&ldquo;': '\u201c',
    '&rdquo;': '\u201d',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&bull;': '\u2022',
    '&bullet;': '\u2022',
  };

  return text.replace(/&[a-zA-Z0-9#]+;/g, (match) => {
    return entities[match] || match;
  });
};

// Clean and decode text, fixing double-encoded UTF-8 from NYC API
const cleanText = (text) => {
  if (!text) return text;

  let cleaned = decodeHtmlEntities(text);

  cleaned = cleaned
    // Fix double-encoded smart punctuation
    .replace(/\u00e2\u0080\u0099/g, "'")
    .replace(/\u00e2\u0080\u009c/g, '"')
    .replace(/\u00e2\u0080\u009d/g, '"')
    .replace(/\u00e2\u0080\u0098/g, "'")
    .replace(/\u00e2\u0080\u0093/g, '-')
    .replace(/\u00e2\u0080\u0094/g, '-')
    .replace(/\u00e2\u0080\u00a6/g, '...')
    .replace(/\u00e2\u0080\u00a2/g, '\u2022')

    // Fix double-encoded symbols
    .replace(/\u00c2\u00a0/g, ' ')
    .replace(/\u00c2\u00a9/g, '\u00a9')
    .replace(/\u00c2\u00ae/g, '\u00ae')
    .replace(/\u00c2\u00b0/g, '\u00b0')
    .replace(/\u00c2\u00b1/g, '\u00b1')
    .replace(/\u00c2\u00b2/g, '\u00b2')
    .replace(/\u00c2\u00b3/g, '\u00b3')
    .replace(/\u00c2\u00bc/g, '\u00bc')
    .replace(/\u00c2\u00bd/g, '\u00bd')
    .replace(/\u00c2\u00be/g, '\u00be')

    // Convert 2+ consecutive spaces to paragraph breaks, but preserve list formatting
    .replace(/(?<!^|\n|\r|\t|\s*[•\-*+]\s*|\s*\d+\.\s*)\s{2,}/g, '<br><br>');

  return cleaned;
};

// Format job description with proper line breaks
const formatJobDescription = (text) => {
  if (!text) return text;

  let formatted = cleanText(text);

  formatted = formatted
    .replace(/(\d+ Hours\/)/g, '\n$1')
    .replace(/(Work Location:)/g, '\n\n$1')
    .replace(/(Additional Information:)/g, '\n\n$1')
    .replace(/(To Apply:)/g, '\n\n$1')
    .replace(/(Hours\/Shift:)/g, '\n\n$1')
    .replace(/\n\n\n+/g, '\n\n')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();

  return formatted;
};

// Clean all text fields on a raw NYC API job object (snake_case)
const TEXT_FIELDS = [
  'business_title', 'civil_service_title', 'job_category', 'work_location',
  'work_location_1', 'division_work_unit', 'agency', 'job_description',
  'minimum_qual_requirements', 'preferred_skills', 'additional_information',
  'to_apply', 'hours_shift', 'residency_requirement',
];

const cleanJobFields = (job) => {
  const cleaned = { ...job };
  for (const field of TEXT_FIELDS) {
    if (cleaned[field]) {
      cleaned[field] = cleanText(cleaned[field]);
    }
  }
  return cleaned;
};

// Remove duplicate jobs by job_id (jobs without an ID are excluded)
const deduplicateJobs = (jobs) => {
  const seen = new Set();
  return jobs.filter((job) => {
    if (!job.job_id) return false;
    if (seen.has(job.job_id)) return false;
    seen.add(job.job_id);
    return true;
  });
};

// Filter jobs in-memory based on search parameters
const filterJobs = (jobs, { q, category, location, agency, salary_min, salary_max }) => {
  let filtered = jobs;

  if (q) {
    const term = q.toLowerCase();
    filtered = filtered.filter(
      (job) =>
        job.business_title?.toLowerCase().includes(term) ||
        job.job_description?.toLowerCase().includes(term) ||
        job.civil_service_title?.toLowerCase().includes(term) ||
        job.agency?.toLowerCase().includes(term) ||
        job.job_category?.toLowerCase().includes(term) ||
        job.work_location?.toLowerCase().includes(term) ||
        job.work_location_1?.toLowerCase().includes(term) ||
        job.division_work_unit?.toLowerCase().includes(term)
    );
  }

  if (category) {
    filtered = filtered.filter(
      (job) => job.job_category?.toLowerCase() === category.toLowerCase()
    );
  }

  if (location) {
    const term = location.toLowerCase();
    filtered = filtered.filter(
      (job) =>
        job.work_location?.toLowerCase().includes(term) ||
        job.work_location_1?.toLowerCase().includes(term)
    );
  }

  if (agency) {
    const term = agency.toLowerCase();
    filtered = filtered.filter(
      (job) => job.agency?.toLowerCase().includes(term)
    );
  }

  if (salary_min) {
    const min = parseInt(salary_min, 10);
    if (!isNaN(min)) {
      filtered = filtered.filter((job) => {
        const to = parseInt(job.salary_range_to, 10);
        const from = parseInt(job.salary_range_from, 10);
        // Include if the job's range overlaps with the minimum
        if (!isNaN(to)) return to >= min;
        return !isNaN(from) && from >= min;
      });
    }
  }

  if (salary_max) {
    const max = parseInt(salary_max, 10);
    if (!isNaN(max)) {
      filtered = filtered.filter((job) => {
        const from = parseInt(job.salary_range_from, 10);
        const to = parseInt(job.salary_range_to, 10);
        // Include if the job's range overlaps with the maximum
        if (!isNaN(from)) return from <= max;
        return !isNaN(to) && to <= max;
      });
    }
  }

  return filtered;
};

// Get salary midpoint for sorting (returns null when missing)
const getSalaryMidpoint = (job, fields) => {
  const from = parseFloat(job[fields.salaryFrom]);
  if (isNaN(from)) return null;
  const to = parseFloat(job[fields.salaryTo]);
  return (from + (isNaN(to) ? from : to)) / 2;
};

// Field name maps for snake_case (NYC raw) and camelCase (transformed) data
const SNAKE_FIELDS = { date: 'posting_date', title: 'business_title', salaryFrom: 'salary_range_from', salaryTo: 'salary_range_to' };
const CAMEL_FIELDS = { date: 'postDate', title: 'businessTitle', salaryFrom: 'salaryRangeFrom', salaryTo: 'salaryRangeTo' };

// Generic sort function that works with any field name map
const sortJobsByFields = (jobs, sort, fields) => {
  const sorted = [...jobs];
  switch (sort) {
    case 'date_asc':
      sorted.sort((a, b) => new Date(a[fields.date] || 0) - new Date(b[fields.date] || 0));
      break;
    case 'title_asc':
      sorted.sort((a, b) => (a[fields.title] || '').localeCompare(b[fields.title] || ''));
      break;
    case 'title_desc':
      sorted.sort((a, b) => (b[fields.title] || '').localeCompare(a[fields.title] || ''));
      break;
    case 'salary_desc':
    case 'salary_asc': {
      const dir = sort === 'salary_desc' ? -1 : 1;
      sorted.sort((a, b) => {
        const sa = getSalaryMidpoint(a, fields);
        const sb = getSalaryMidpoint(b, fields);
        if (sa == null && sb == null) return 0;
        if (sa == null) return 1;
        if (sb == null) return -1;
        return dir * (sa - sb);
      });
      break;
    }
    case 'date_desc':
    default:
      sorted.sort((a, b) => new Date(b[fields.date] || 0) - new Date(a[fields.date] || 0));
      break;
  }
  return sorted;
};

// Sort raw NYC API jobs (snake_case)
const sortJobs = (jobs, sort) => sortJobsByFields(jobs, sort, SNAKE_FIELDS);

// Sort transformed camelCase jobs (for 'all' mode where NYC + federal are combined)
const sortMergedJobs = (jobs, sort) => sortJobsByFields(jobs, sort, CAMEL_FIELDS);

// Transform NYC API snake_case fields to camelCase model fields
const transformNycJob = (nycJob, { clean = false } = {}) => {
  const t = clean ? cleanText : (v) => v;
  const fd = clean ? formatJobDescription : (v) => v;

  return {
    jobId: nycJob.job_id,
    businessTitle: t(nycJob.business_title),
    civilServiceTitle: t(nycJob.civil_service_title),
    titleCodeNo: nycJob.title_code_no,
    level: nycJob.level,
    jobCategory: t(nycJob.job_category),
    fullTimePartTimeIndicator: nycJob.full_time_part_time_indicator,
    salaryRangeFrom: nycJob.salary_range_from ? parseFloat(nycJob.salary_range_from) : null,
    salaryRangeTo: nycJob.salary_range_to ? parseFloat(nycJob.salary_range_to) : null,
    salaryFrequency: nycJob.salary_frequency,
    workLocation: t(nycJob.work_location),
    divisionWorkUnit: t(nycJob.division_work_unit),
    jobDescription: fd(nycJob.job_description),
    minimumQualRequirements: t(nycJob.minimum_qual_requirements),
    preferredSkills: t(nycJob.preferred_skills),
    additionalInformation: t(nycJob.additional_information),
    toApply: t(nycJob.to_apply),
    hoursShift: t(nycJob.hours_shift),
    workLocation1: t(nycJob.work_location_1),
    residencyRequirement: t(nycJob.residency_requirement),
    postDate: nycJob.posting_date,
    processDate: nycJob.process_date,
    postUntil: nycJob.post_until,
    agency: t(nycJob.agency),
  };
};

// Transform USAJobs API response item to camelCase model fields
const FREQUENCY_MAP = {
  PA: 'Annual',
  PH: 'Hourly',
  PD: 'Daily',
  PW: 'Bi-Weekly',
  PM: 'Monthly',
};

const transformUsaJob = (usaItem) => {
  const desc = usaItem?.MatchedObjectDescriptor;
  if (!desc) return null;
  const details = desc.UserArea?.Details || {};
  const remuneration = desc.PositionRemuneration?.[0] || {};

  const descriptionParts = [
    details.JobSummary,
    details.MajorDuties,
  ].filter(Boolean);
  const jobDescription = descriptionParts.join('\n\n') || desc.QualificationSummary || '';

  return {
    jobId: usaItem.MatchedObjectId,
    source: 'federal',
    businessTitle: desc.PositionTitle,
    civilServiceTitle: null,
    titleCodeNo: null,
    level: desc.JobGrade?.[0]?.Code || null,
    jobCategory: desc.JobCategory?.[0]?.Name || null,
    fullTimePartTimeIndicator: desc.PositionSchedule?.[0]?.Name || null,
    salaryRangeFrom: remuneration.MinimumRange ? parseFloat(remuneration.MinimumRange) : null,
    salaryRangeTo: remuneration.MaximumRange ? parseFloat(remuneration.MaximumRange) : null,
    salaryFrequency: FREQUENCY_MAP[remuneration.RateIntervalCode] || remuneration.RateIntervalCode || null,
    workLocation: desc.PositionLocationDisplay || null,
    divisionWorkUnit: desc.DepartmentName || null,
    jobDescription,
    minimumQualRequirements: desc.QualificationSummary || null,
    preferredSkills: null,
    additionalInformation: details.Education || null,
    toApply: desc.ApplyURI?.[0] || null,
    externalUrl: desc.ApplyURI?.[0] || null,
    hoursShift: null,
    workLocation1: null,
    residencyRequirement: null,
    postDate: desc.PublicationStartDate || null,
    processDate: null,
    postUntil: desc.ApplicationCloseDate || null,
    agency: desc.OrganizationName || null,
  };
};

// Transform NYS StateJobsNY scraped fields to camelCase model fields
const transformNysJob = (nys) => {
  // Parse salary range like "From $50425 to $61548 Annually"
  let salaryRangeFrom = null;
  let salaryRangeTo = null;
  let salaryFrequency = null;
  const salaryStr = nys['Salary Range'] || '';
  const rangeMatch = salaryStr.match(/\$?([\d,]+).*?\$?([\d,]+)\s*(Annually|Hourly|Daily|Monthly|Bi-Weekly)?/i);
  const singleMatch = !rangeMatch && salaryStr.match(/\$?([\d,]+)\s*(Annually|Hourly|Daily|Monthly|Bi-Weekly)?/i);
  if (rangeMatch) {
    salaryRangeFrom = parseFloat(rangeMatch[1].replace(/,/g, ''));
    salaryRangeTo = parseFloat(rangeMatch[2].replace(/,/g, ''));
    salaryFrequency = rangeMatch[3] || 'Annual';
  } else if (singleMatch) {
    salaryRangeFrom = parseFloat(singleMatch[1].replace(/,/g, ''));
    salaryFrequency = singleMatch[2] || 'Annual';
  }

  // Parse dates from MM/DD/YY format
  const parseNysDate = (str) => {
    if (!str) return null;
    const m = str.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (!m) return null;
    const year = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    return new Date(year, parseInt(m[1]) - 1, parseInt(m[2]));
  };

  const location = [nys['Street Address'], nys['City'], nys['State'], nys['Zip Code']]
    .filter(Boolean).join(', ');

  return {
    jobId: nys['Vacancy ID'],
    source: 'nys',
    businessTitle: nys['Title'] || null,
    civilServiceTitle: null,
    titleCodeNo: null,
    level: nys['Salary Grade'] || null,
    jobCategory: nys['Occupational Category'] || null,
    fullTimePartTimeIndicator: nys['Employment Type'] || null,
    salaryRangeFrom,
    salaryRangeTo,
    salaryFrequency,
    workLocation: nys['County'] || null,
    divisionWorkUnit: nys['Bargaining Unit'] || null,
    jobDescription: nys['Duties Description'] || null,
    minimumQualRequirements: nys['Minimum Qualifications'] || null,
    preferredSkills: null,
    additionalInformation: nys['Notes on Applying'] || null,
    toApply: nys['Notes on Applying'] || null,
    externalUrl: nys._detailUrl || null,
    hoursShift: nys['Workweek'] ? `${nys['Workweek']} ${nys['Hours Per Week'] ? nys['Hours Per Week'] + ' hrs/wk' : ''}`.trim() : null,
    workLocation1: location || null,
    residencyRequirement: null,
    postDate: parseNysDate(nys['Date Posted']),
    processDate: null,
    postUntil: parseNysDate(nys['Applications Due']),
    agency: nys['Agency'] || null,
  };
};

// Extract a user's save entry from a job document
const getUserSaveEntry = (job, userId) => {
  const entry = job.savedBy?.find(
    (s) => s.user.toString() === userId.toString()
  );
  if (!entry) return {
    isSaved: false, applicationStatus: null, savedAt: null, statusHistory: [],
    applicationDate: null, interviewDate: null, followUpDate: null, documentLinks: [],
  };
  return {
    isSaved: true,
    applicationStatus: entry.applicationStatus || 'interested',
    savedAt: entry.savedAt,
    statusUpdatedAt: entry.statusUpdatedAt,
    statusHistory: entry.statusHistory || [],
    applicationDate: entry.applicationDate || null,
    interviewDate: entry.interviewDate || null,
    followUpDate: entry.followUpDate || null,
    documentLinks: entry.documentLinks || [],
  };
};

// Escape a value for CSV output (protects against formula injection)
const escCsv = (val) => {
  if (val == null) return '';
  let s = String(val);
  // Prefix formula-triggering characters to prevent spreadsheet injection
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
};

// Escape special regex characters for safe use in RegExp constructors
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = {
  cleanText,
  cleanJobFields,
  formatJobDescription,
  deduplicateJobs,
  filterJobs,
  sortJobs,
  sortMergedJobs,
  transformNycJob,
  transformUsaJob,
  transformNysJob,
  getUserSaveEntry,
  escCsv,
  escapeRegex,
};
