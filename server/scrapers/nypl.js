/**
 * New York Public Library Jobs (Pinpoint ATS — public JSON endpoint)
 */

const { axios, parseSalaryRange, safeDate, batchUpsert } = require('./utils');
const { normalizeSalaryFrequency } = require('../helpers/salary');

const NYPL_POSTINGS_URL = 'https://nypl.pinpointhq.com/postings.json';

const refreshNyplJobs = async (timestamp) => {
  console.log('[refresh] Fetching NYPL jobs...');

  let allJobs = [];

  try {
    const { data } = await axios.get(NYPL_POSTINGS_URL, { timeout: 30000 });
    allJobs = data?.data || [];
    console.log(`[refresh] NYPL: ${allJobs.length} total jobs`);
  } catch (err) {
    console.warn('[refresh] NYPL fetch error:', err.message);
    return { upserted: 0, modified: 0 };
  }

  const jobs = allJobs.map((raw) => {
    const salary = parseSalaryRange(raw.compensation);

    return {
      jobId: raw.id,
      businessTitle: raw.title || null,
      agency: 'New York Public Library',
      workLocation: raw.location?.name || null,
      workLocation1: typeof raw.job?.structure_custom_group_one === 'string' ? raw.job.structure_custom_group_one : null,
      jobDescription: raw.description || null,
      minimumQualRequirements: raw.key_responsibilities || null,
      jobCategory: raw.job?.department?.name || null,
      salaryRangeFrom: raw.compensation_minimum || salary.from,
      salaryRangeTo: raw.compensation_maximum || salary.to,
      // The feed emits bare "hour"/"year"; a check for "hourly"/"yearly" matched
      // neither and fell through to Annual, so hourly postings rendered as
      // "$17.00 Annual". normalizeSalaryFrequency knows both spellings.
      salaryFrequency: (raw.compensation_minimum || salary.from)
        ? (normalizeSalaryFrequency(raw.compensation_frequency) || salary.frequency || 'Annual')
        : null,
      fullTimePartTimeIndicator: raw.employment_type_text || null,
      preferredSkills: raw.skills_knowledge_expertise || null,
      postUntil: safeDate(raw.deadline_at),
      externalUrl: raw.url || `https://nypl.pinpointhq.com/en/postings/${raw.id}`,
      // Pinpoint's postings.json exposes no published date (verified live) —
      // stamp first-seen on insert so date sorting works for this source.
      _setOnInsert: { postDate: timestamp },
    };
  });

  return batchUpsert(jobs, 'nypl', timestamp, 'NYPL');
};

module.exports = refreshNyplJobs;
