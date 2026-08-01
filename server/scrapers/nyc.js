/**
 * NYC Jobs scraper — fetches from NYC Open Data API.
 */

const { axios, batchUpsert } = require('./utils');
const {
  cleanJobFields,
  deduplicateJobs,
  transformNycJob,
} = require('../helpers/jobHelpers');

const BATCH_SIZE = 1000; // NYC API page size
const MAX_NYC_API_OFFSET = 50000;
const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

const refreshNycJobs = async (timestamp) => {
  if (!process.env.NYC_JOBS_API_URL) {
    console.warn('[refresh] NYC_JOBS_API_URL not set — skipping NYC jobs');
    return { upserted: 0, modified: 0 };
  }

  console.log('[refresh] Fetching NYC jobs...');
  let allRaw = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams();
    params.append('$limit', BATCH_SIZE);
    params.append('$offset', offset);

    let batch = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await axios.get(
          `${process.env.NYC_JOBS_API_URL}?${params.toString()}`,
          { timeout: 30000 }
        );
        batch = res.data;
        break;
      } catch (err) {
        console.warn(`[refresh] NYC fetch attempt ${attempt + 1} failed at offset ${offset}: ${err.message}`);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, BASE_DELAY * Math.pow(2, attempt)));
        }
      }
    }

    if (!batch) {
      console.error('[refresh] NYC fetch failed after retries — using partial data');
      hasMore = false;
    } else if (batch.length === 0) {
      hasMore = false;
    } else {
      allRaw = allRaw.concat(batch);
      offset += BATCH_SIZE;
      if (offset > MAX_NYC_API_OFFSET) hasMore = false;
    }
  }

  console.log(`[refresh] Fetched ${allRaw.length} raw NYC jobs`);
  const deduplicated = deduplicateJobs(allRaw);
  const jobs = deduplicated.map(cleanJobFields);

  // Already cleaned above — transformNycJob must not clean a second time.
  return batchUpsert(jobs.map((raw) => transformNycJob(raw, { clean: false })), 'nyc', timestamp, 'NYC');
};

module.exports = refreshNycJobs;
