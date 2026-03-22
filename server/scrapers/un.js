/**
 * United Nations Jobs scraper — fetches from UN Careers REST API.
 */

const { axios, Job, geocodeLocationBase, UPSERT_BATCH } = require('./utils');

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

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const dutyStation = raw.dutyStation?.[0]?.description || 'New York';
      const job = {
        jobId: String(raw.jobId),
        businessTitle: raw.postingTitle || raw.jobTitle || null,
        agency: raw.dept?.name || 'United Nations',
        workLocation: dutyStation,
        workLocation1: null,
        divisionWorkUnit: raw.dept?.name || null,
        jobDescription: raw.jobDescription || null,
        jobCategory: raw.jc?.name || raw.jf?.Name || null,
        salaryRangeFrom: null,
        salaryRangeTo: null,
        salaryFrequency: null,
        fullTimePartTimeIndicator: raw.recruitmentType === 'I' ? 'Full-Time' : null,
        postDate: raw.startDate ? new Date(raw.startDate) : null,
        postUntil: raw.endDate ? new Date(raw.endDate) : null,
        externalUrl: `https://careers.un.org/jobSearchDescription/${raw.jobId}?language=en`,
        level: raw.jl?.name || raw.jobLevel || null,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'un');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'un' },
          update: {
            $set: { ...job, source: 'un', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
            $setOnInsert: { savedBy: [] },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] UN: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshUnJobs;
