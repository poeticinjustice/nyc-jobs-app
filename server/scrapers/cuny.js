/**
 * CUNY Jobs scraper — fetches from DirectEmployers / Solr API.
 */

const { axios, Job, geocodeLocationBase, UPSERT_BATCH, parseSalaryRange } = require('./utils');

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

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      // Parse salary from description text
      const desc = raw.description || '';
      const { from: salaryFrom, to: salaryTo, frequency: salaryFrequency } = parseSalaryRange(desc) || {};


      const job = {
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
        postDate: raw.date_new || raw.date_added || null,
        externalUrl: raw.title_slug && raw.guid
          ? `https://cuny.jobs/${raw.title_slug}/${raw.guid}/job/`
          : `https://cuny.jobs/jobs/${raw.guid || ''}`,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'cuny');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'cuny' },
          update: {
            $set: { ...job, source: 'cuny', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
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

  console.log(`[refresh] CUNY: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshCunyJobs;
