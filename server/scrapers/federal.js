/**
 * Federal Jobs scraper — fetches from USAJobs API.
 */

const { axios, Job, geocodeLocationBase, UPSERT_BATCH } = require('./utils');
const { transformUsaJob } = require('../helpers/jobHelpers');
const { getUsaHeaders } = require('../helpers/usaJobsApi');

const refreshFederalJobs = async (timestamp) => {
  if (!process.env.USAJOBS_API_KEY || !process.env.USAJOBS_EMAIL || !process.env.USAJOBS_BASE_URL) {
    console.warn('[refresh] USAJobs credentials not set — skipping federal jobs');
    return { upserted: 0, modified: 0 };
  }

  console.log('[refresh] Fetching federal jobs...');
  const headers = getUsaHeaders();
  const seen = new Set();
  const allJobs = [];

  // Broad search by NYC-area locations
  const searchLocations = ['New York City, NY', 'Brooklyn, NY', 'Bronx, NY', 'Queens, NY', 'Staten Island, NY'];

  for (const locationName of searchLocations) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams();
      params.append('LocationName', locationName);
      params.append('ResultsPerPage', '250');
      params.append('Page', String(page));
      params.append('Fields', 'Full');
      params.append('SortField', 'opendate');
      params.append('SortDirection', 'Desc');

      try {
        const res = await axios.get(`${process.env.USAJOBS_BASE_URL}?${params.toString()}`, {
          headers,
          timeout: 15000,
        });

        const searchResult = res.data.SearchResult;
        const items = searchResult?.SearchResultItems || [];
        const totalCount = parseInt(searchResult?.SearchResultCountAll) || 0;

        for (const item of items) {
          const id = item.MatchedObjectId;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const job = transformUsaJob(item);
          if (job) allJobs.push(job);
        }

        // Check if there are more pages
        const fetched = page * 250;
        if (fetched >= totalCount || items.length === 0) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (err) {
        console.warn(`[refresh] USAJobs fetch error (${locationName}, page ${page}): ${err.message}`);
        hasMore = false;
      }
    }
  }

  console.log(`[refresh] Fetched ${allJobs.length} federal jobs`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((job) => {
      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'federal');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'federal' },
          update: {
            $set: {
              ...job,
              source: 'federal',
              coordinates: coords || { lat: null, lng: null },
              lastRefreshedAt: timestamp,
            },
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

  console.log(`[refresh] Federal: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshFederalJobs;
