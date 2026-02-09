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

// Remove duplicate jobs by job_id
const deduplicateJobs = (jobs) => {
  const seen = new Set();
  return jobs.filter((job) => {
    if (job.job_id && !seen.has(job.job_id)) {
      seen.add(job.job_id);
      return true;
    }
    return false;
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
    const min = parseInt(salary_min);
    filtered = filtered.filter(
      (job) => job.salary_range_from && parseInt(job.salary_range_from) >= min
    );
  }

  if (salary_max) {
    const max = parseInt(salary_max);
    filtered = filtered.filter(
      (job) => job.salary_range_to && parseInt(job.salary_range_to) <= max
    );
  }

  return filtered;
};

// Get salary midpoint for sorting (returns null when missing)
const getSalaryValue = (job) => {
  const from = parseInt(job.salary_range_from);
  const to = parseInt(job.salary_range_to);
  if (!from || !to || isNaN(from) || isNaN(to)) return null;
  return Math.round((from + to) / 2);
};

// Sort jobs by the given sort parameter
const sortJobs = (jobs, sort) => {
  const sorted = [...jobs];

  switch (sort) {
    case 'date_asc':
      sorted.sort((a, b) => {
        const dateA = a.posting_date ? new Date(a.posting_date) : new Date(0);
        const dateB = b.posting_date ? new Date(b.posting_date) : new Date(0);
        return dateA - dateB;
      });
      break;
    case 'title_asc':
      sorted.sort((a, b) =>
        (a.business_title || '').toLowerCase().localeCompare((b.business_title || '').toLowerCase())
      );
      break;
    case 'title_desc':
      sorted.sort((a, b) =>
        (b.business_title || '').toLowerCase().localeCompare((a.business_title || '').toLowerCase())
      );
      break;
    case 'salary_desc':
      sorted.sort((a, b) => {
        const sa = getSalaryValue(a);
        const sb = getSalaryValue(b);
        if (sa === null && sb === null) return 0;
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sb - sa;
      });
      break;
    case 'salary_asc':
      sorted.sort((a, b) => {
        const sa = getSalaryValue(a);
        const sb = getSalaryValue(b);
        if (sa === null && sb === null) return 0;
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sa - sb;
      });
      break;
    case 'date_desc':
    default:
      sorted.sort((a, b) => {
        const dateA = a.posting_date ? new Date(a.posting_date) : new Date(0);
        const dateB = b.posting_date ? new Date(b.posting_date) : new Date(0);
        return dateB - dateA;
      });
      break;
  }

  return sorted;
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
    salaryRangeFrom: nycJob.salary_range_from,
    salaryRangeTo: nycJob.salary_range_to,
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

// Extract a user's save entry from a job document
const getUserSaveEntry = (job, userId) => {
  const entry = job.savedBy?.find(
    (s) => s.user.toString() === userId.toString()
  );
  if (!entry) return { isSaved: false, applicationStatus: null, savedAt: null, statusHistory: [] };
  return {
    isSaved: true,
    applicationStatus: entry.applicationStatus || 'interested',
    savedAt: entry.savedAt,
    statusUpdatedAt: entry.statusUpdatedAt,
    statusHistory: entry.statusHistory || [],
  };
};

module.exports = {
  cleanText,
  cleanJobFields,
  formatJobDescription,
  deduplicateJobs,
  filterJobs,
  sortJobs,
  transformNycJob,
  transformUsaJob,
  getUserSaveEntry,
};
