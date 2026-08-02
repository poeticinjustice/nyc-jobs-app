/**
 * United Nations Jobs scraper — fetches from UN Careers REST API.
 */

const { axios, safeDate, batchUpsert } = require('./utils');

const UN_API_URL = 'https://careers.un.org/api/public/opening/jo/list/filteredV2/en';

const refreshUnJobs = async (timestamp) => {
  console.log('[refresh] Fetching UN jobs...');

  let allJobs = [];

  try {
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data } = await axios.post(UN_API_URL, {
        filterConfig: { jle: [], ds: ['NEWYORK'] },
        pagination: { page, itemPerPage: 100, sortBy: 'startDate', sortDirection: -1 },
      }, {
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000,
      });

      const jobs = data.data?.list || data.list || [];
      if (page === 0) {
        console.log(`[refresh] UN: ${data.data?.totalCount || jobs.length} total NY jobs`);
      }

      if (jobs.length === 0) {
        hasMore = false;
      } else {
        allJobs.push(...jobs);
        page++;
        if (jobs.length < 100) hasMore = false;
      }
      if (page > 10) break; // safety
    }
  } catch (err) {
    console.warn('[refresh] UN fetch error (partial data may be used):', err.message);
  }

  // Filter out expired jobs
  const now = new Date();
  const activeJobs = allJobs.filter((j) => !j.endDate || new Date(j.endDate) >= now);
  console.log(`[refresh] Fetched ${allJobs.length} UN jobs (${activeJobs.length} active, ${allJobs.length - activeJobs.length} expired)`);
  if (activeJobs.length === 0) return { upserted: 0, modified: 0 };
  allJobs = activeJobs;

  const jobs = allJobs.map((raw) => ({
    jobId: String(raw.jobId),
    businessTitle: raw.postingTitle || raw.jobTitle || null,
    agency: raw.dept?.name || 'United Nations',
    workLocation: raw.dutyStation?.[0]?.description || 'New York',
    workLocation1: null,
    divisionWorkUnit: raw.dept?.name || null,
    jobDescription: raw.jobDescription || null,
    jobCategory: raw.jc?.name || raw.jf?.Name || null,
    salaryRangeFrom: null,
    salaryRangeTo: null,
    salaryFrequency: null,
    fullTimePartTimeIndicator: raw.recruitmentType === 'I' ? 'Full-Time' : null,
    postDate: safeDate(raw.startDate),
    postUntil: safeDate(raw.endDate),
    externalUrl: `https://careers.un.org/jobSearchDescription/${raw.jobId}?language=en`,
    level: raw.jl?.name || raw.jobLevel || null,
  }));

  return batchUpsert(jobs, 'un', timestamp, 'UN');
};

module.exports = refreshUnJobs;
