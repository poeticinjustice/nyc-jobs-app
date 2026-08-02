const { JOB_SOURCES } = require('../../shared/constants');
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

// Clean and decode text, fixing double-encoded UTF-8 from NYC API.
// addBreaks: convert multi-space runs to <br><br> paragraph markers — only
// wanted for long-form fields; scalar fields (titles, agency, locations) must
// stay plain text.
const cleanText = (text, addBreaks = true) => {
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
    .replace(/\u00c2\u00be/g, '\u00be');

  if (addBreaks) {
    // Convert 2+ consecutive spaces to paragraph breaks, but preserve list formatting
    cleaned = cleaned.replace(/(?<!^|\n|\r|\t|\s*[•\-*+]\s*|\s*\d+\.\s*)\s{2,}/g, '<br><br>');
  } else {
    // Scalar fields: collapse space runs instead (newlines untouched)
    cleaned = cleaned.replace(/[^\S\n]{2,}/g, ' ');
  }

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

// Clean all text fields on a raw NYC API job object (snake_case).
// Long-form fields get <br><br> paragraph markers; scalar fields must not —
// a double space inside a title/agency/location would otherwise render as
// literal "<br><br>" in plain-text contexts.
const LONG_TEXT_FIELDS = [
  'job_description', 'minimum_qual_requirements', 'preferred_skills',
  'additional_information', 'to_apply', 'residency_requirement',
];
const SCALAR_TEXT_FIELDS = [
  'business_title', 'civil_service_title', 'job_category', 'work_location',
  'work_location_1', 'division_work_unit', 'agency', 'hours_shift',
];
const TEXT_FIELDS = [...LONG_TEXT_FIELDS, ...SCALAR_TEXT_FIELDS];

const cleanJobFields = (job) => {
  const cleaned = { ...job };
  for (const field of LONG_TEXT_FIELDS) {
    if (cleaned[field]) {
      cleaned[field] = cleanText(cleaned[field]);
    }
  }
  for (const field of SCALAR_TEXT_FIELDS) {
    if (cleaned[field]) {
      cleaned[field] = cleanText(cleaned[field], false);
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
    hoursShift: details.WorkSchedule || null,
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
  const rangeMatch = salaryStr.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:to|-)\s*\$\s*([\d,]+(?:\.\d+)?)\s*(Annually|Hourly|Daily|Monthly|Bi-Weekly)?/i);
  const singleMatch = !rangeMatch && salaryStr.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(Annually|Hourly|Daily|Monthly|Bi-Weekly)?/i);
  // Normalize NYS's adverb forms to the app-wide values ('Annually' -> 'Annual')
  const normalizeFrequency = (freq) => {
    if (!freq) return 'Annual';
    const map = { annually: 'Annual', hourly: 'Hourly', daily: 'Daily', monthly: 'Monthly', 'bi-weekly': 'Bi-Weekly' };
    return map[freq.toLowerCase()] || freq;
  };
  if (rangeMatch) {
    salaryRangeFrom = parseFloat(rangeMatch[1].replace(/,/g, ''));
    salaryRangeTo = parseFloat(rangeMatch[2].replace(/,/g, ''));
    // If from === to, it's a single rate (e.g., "$22.59 to $22.59 Hourly")
    if (salaryRangeFrom === salaryRangeTo) salaryRangeTo = null;
    salaryFrequency = normalizeFrequency(rangeMatch[3]);
  } else if (singleMatch) {
    salaryRangeFrom = parseFloat(singleMatch[1].replace(/,/g, ''));
    salaryFrequency = normalizeFrequency(singleMatch[2]);
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
  // A bare CR mid-value splits the row in some readers, so quote it too.
  return /[,"\n\r]/.test(s)
    ? `"${s.replace(/"/g, '""')}"`
    : s;
};

// Escape special regex characters for safe use in RegExp constructors
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Build Mongoose sort from a sort query param.
// Shared by the search routes and the saved-search alert engine.
const buildSort = (sort) => {
  switch (sort) {
    case 'date_asc': return { postDate: 1 };
    case 'title_asc': return { businessTitle: 1 };
    case 'title_desc': return { businessTitle: -1 };
    // Annual equivalents, not the raw figures: sorting on the raw column put
    // a $16/hour role above a $60,000/year one.
    case 'salary_desc': return { annualSalaryFrom: -1 };
    case 'salary_asc': return { annualSalaryFrom: 1 };
    case 'date_desc':
    default: return { postDate: -1 };
  }
};

// Build Mongoose filter from search params
const buildSearchFilter = ({ q, category, location, agency, salary_min, salary_max, source }) => {
  const filter = {};

  if (source && source !== 'all') {
    // Support comma-separated sources (e.g. "nyc,federal,cuny")
    const sources = source.split(',').filter((s) => JOB_SOURCES.includes(s));
    if (sources.length === 1) {
      filter.source = sources[0];
    } else if (sources.length > 1) {
      filter.source = { $in: sources };
    } else {
      filter.source = { $in: JOB_SOURCES };
    }
  } else {
    // 'all' still restricts to valid sources — prevents stale/unknown sources from leaking
    filter.source = { $in: JOB_SOURCES };
  }

  // Exclude expired jobs (postUntil in the past)
  const notExpired = {
    $or: [
      { postUntil: null },
      { postUntil: { $exists: false } },
      { postUntil: { $gte: new Date() } },
    ],
  };
  filter.$and = filter.$and ? [...filter.$and, notExpired] : [notExpired];

  if (q) {
    filter.$text = { $search: q };
  }

  if (category) {
    filter.jobCategory = new RegExp(`^${escapeRegex(category)}$`, 'i');
  }

  if (location) {
    const locRegex = new RegExp(escapeRegex(location), 'i');
    filter.$or = [
      { workLocation: locRegex },
      { workLocation1: locRegex },
    ];
  }

  if (agency) {
    filter.agency = new RegExp(escapeRegex(agency), 'i');
  }

  // Salary overlap: job range overlaps with [salary_min, salary_max].
  // Compared on the annual columns — the raw ones hold whatever unit the source
  // advertised, so a $95/hour posting (~$198k a year) was excluded by
  // salary_min=100000 and matched by salary_max=60000.
  if (salary_min || salary_max) {
    const salaryConditions = [];
    if (salary_min) {
      const min = parseInt(salary_min, 10);
      if (!isNaN(min)) {
        // Job's upper bound >= min (or lower bound if no upper)
        salaryConditions.push({
          $or: [
            { annualSalaryTo: { $gte: min } },
            { annualSalaryTo: null, annualSalaryFrom: { $gte: min } },
          ],
        });
      }
    }
    if (salary_max) {
      const max = parseInt(salary_max, 10);
      if (!isNaN(max)) {
        // Job's lower bound <= max (or upper bound if no lower)
        salaryConditions.push({
          $or: [
            { annualSalaryFrom: { $lte: max } },
            { annualSalaryFrom: null, annualSalaryTo: { $lte: max } },
          ],
        });
      }
    }
    if (salaryConditions.length > 0) {
      // Ensure $and exists (it should, from notExpired)
      if (!filter.$and) filter.$and = [];
      // Move location $or into $and to avoid conflicts
      if (filter.$or) {
        filter.$and.push({ $or: filter.$or });
        delete filter.$or;
      }
      filter.$and.push(...salaryConditions);
    }
  }

  return filter;
};


module.exports = {
  cleanText,
  cleanJobFields,
  formatJobDescription,
  deduplicateJobs,
  transformNycJob,
  transformUsaJob,
  transformNysJob,
  getUserSaveEntry,
  escCsv,
  escapeRegex,
  buildSearchFilter,
  buildSort,
};
