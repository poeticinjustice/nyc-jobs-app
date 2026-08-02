/**
 * CUNY Jobs scraper — fetches from DirectEmployers / Solr API.
 */

const { axios, parseSalaryRange, safeDate, batchUpsert } = require('./utils');

const CUNY_SEARCH_URL = 'https://prod-search-api.jobsyn.org/api/v1/solr/search';
const CUNY_PAGE_SIZE = 10; // API enforces max 10

const refreshCunyJobs = async (timestamp) => {
  console.log('[refresh] Fetching CUNY jobs...');

  let allJobs = [];
  let page = 1;
  let totalPages = 1;

  try {
    while (page <= totalPages) {
      const { data } = await axios.get(CUNY_SEARCH_URL, {
        params: { q: '', 'job-folder': 'cuny-jobs', source: 'solr', page, num_items: CUNY_PAGE_SIZE, sort: 'date' },
        headers: { Accept: 'application/json', 'X-Origin': 'cuny.jobs' },
        timeout: 15000,
      });

      if (page === 1) {
        totalPages = data.pagination?.total_pages || 1;
        console.log(`[refresh] CUNY: ${data.pagination?.total || 0} total jobs, ${totalPages} pages`);
      }

      if (data.jobs) allJobs.push(...data.jobs);
      page++;
    }
  } catch (err) {
    console.warn('[refresh] CUNY fetch error (partial data may be used):', err.message);
  }

  console.log(`[refresh] Fetched ${allJobs.length} CUNY jobs`);

  const jobs = allJobs.map((raw) => {
    // Parse salary from description text
    const { from: salaryFrom, to: salaryTo, frequency: salaryFrequency } =
      parseSalaryRange(raw.description || '') || {};

    return {
      jobId: raw.guid || raw.reqid,
      businessTitle: raw.title_exact || raw.title,
      agency: raw.location_name || 'CUNY',
      workLocation: raw.city_exact || null,
      workLocation1: raw.location_exact || null,
      jobDescription: raw.description || null,
      jobCategory: null,
      salaryRangeFrom: salaryFrom,
      salaryRangeTo: salaryTo,
      salaryFrequency,
      fullTimePartTimeIndicator: raw.job_type || null,
      postDate: safeDate(raw.date_new || raw.date_added),
      externalUrl: raw.title_slug && raw.guid
        ? `https://cuny.jobs/${raw.title_slug}/${raw.guid}/job/`
        : `https://cuny.jobs/jobs/${raw.guid || ''}`,
    };
  });

  return batchUpsert(jobs, 'cuny', timestamp, 'CUNY');
};

module.exports = refreshCunyJobs;
