/**
 * Idealist.org Non-Profit Jobs (Algolia API)
 */

const { axios, Job, geocodeLocationBase, UPSERT_BATCH, safeDate } = require('./utils');

const IDEALIST_ALGOLIA_URL = 'https://NSV3AUESS7-dsn.algolia.net/1/indexes/idealist7-production/query';
const IDEALIST_API_KEY = 'c2730ea10ab82787f2f3cc961e8c1e06';
const IDEALIST_APP_ID = 'NSV3AUESS7';

const refreshIdealistJobs = async (timestamp) => {
  console.log('[refresh] Fetching Idealist jobs...');

  let allJobs = [];
  let page = 0;
  let totalPages = 1;

  try {
    while (page < totalPages) {
      const { data } = await axios.post(IDEALIST_ALGOLIA_URL, {
        query: '',
        filters: 'type:JOB',
        aroundLatLng: '40.7128,-74.0060',
        aroundRadius: 40000, // ~25 miles
        hitsPerPage: 1000,
        page,
      }, {
        headers: {
          'X-Algolia-API-Key': IDEALIST_API_KEY,
          'X-Algolia-Application-Id': IDEALIST_APP_ID,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      if (page === 0) {
        totalPages = data.nbPages || 1;
        console.log(`[refresh] Idealist: ${data.nbHits || 0} total jobs, ${totalPages} pages`);
      }

      if (data.hits) allJobs.push(...data.hits);
      page++;
    }
  } catch (err) {
    console.warn('[refresh] Idealist fetch error (partial data may be used):', err.message);
  }

  console.log(`[refresh] Fetched ${allJobs.length} Idealist jobs`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const salaryFrom = raw.salaryMinimum ? parseFloat(raw.salaryMinimum) : null;
      const salaryTo = raw.salaryMaximum ? parseFloat(raw.salaryMaximum) : null;
      const period = raw.salaryPeriod === 'YEAR' ? 'Annual' : raw.salaryPeriod === 'HOUR' ? 'Hourly' : raw.salaryPeriod || null;

      const job = {
        jobId: raw.objectID,
        businessTitle: raw.name || null,
        agency: raw.orgName || null,
        workLocation: raw.city || null,
        workLocation1: [raw.city, raw.state].filter(Boolean).join(', ') || null,
        jobDescription: raw.description || null,
        jobCategory: raw.areasOfFocus?.[0] || null,
        salaryRangeFrom: salaryFrom,
        salaryRangeTo: salaryTo,
        salaryFrequency: salaryFrom ? period : null,
        fullTimePartTimeIndicator: raw.isFullTime === true ? 'Full-Time' : raw.isFullTime === false ? 'Part-Time' : null,
        postDate: typeof raw.published === 'number' ? safeDate(raw.published * 1000) : safeDate(raw.published),
        externalUrl: raw.url?.en ? `https://www.idealist.org${raw.url.en}` : null,
      };

      const lat = raw._geoloc?.lat || null;
      const lng = raw._geoloc?.lng || null;
      const coords = (lat && lng) ? { lat, lng } : geocodeLocationBase(job.workLocation, job.workLocation1, 'idealist');

      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'idealist' },
          update: {
            $set: { ...job, source: 'idealist', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
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

  console.log(`[refresh] Idealist: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshIdealistJobs;
