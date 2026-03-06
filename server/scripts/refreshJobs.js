/**
 * Refresh script — fetches all jobs from external APIs and upserts into MongoDB.
 *
 * Usage:
 *   node server/scripts/refreshJobs.js          # one-shot run
 *   Programmatic: require('./refreshJobs').refreshAllJobs()
 */

const axios = require('axios');
const cheerio = require('cheerio');
const Job = require('../models/Job');
const {
  cleanJobFields,
  deduplicateJobs,
  transformNycJob,
  transformUsaJob,
  transformNysJob,
} = require('../helpers/jobHelpers');
const { geocodeLocationBase } = require('../helpers/geocoding');
const { getUsaHeaders } = require('../helpers/usaJobsApi');

const BATCH_SIZE = 1000; // NYC API page size
const MAX_NYC_API_OFFSET = 50000;
const MAX_RETRIES = 3;
const BASE_DELAY = 1000;
const UPSERT_BATCH = 500;

// ---------------------------------------------------------------------------
// NYC Jobs
// ---------------------------------------------------------------------------

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

  let totalUpserted = 0;
  let totalModified = 0;

  // Bulk upsert in batches
  for (let i = 0; i < jobs.length; i += UPSERT_BATCH) {
    const slice = jobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const transformed = transformNycJob(raw, { clean: false }); // already cleaned
      const coords = geocodeLocationBase(transformed.workLocation, transformed.workLocation1, 'nyc');
      return {
        updateOne: {
          filter: { jobId: transformed.jobId, source: 'nyc' },
          update: {
            $set: {
              ...transformed,
              source: 'nyc',
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

  console.log(`[refresh] NYC: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// Federal Jobs (USAJobs)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// NYS Jobs (StateJobsNY)
// ---------------------------------------------------------------------------

const NYS_TABLE_URL = 'https://statejobs.ny.gov/public/vacancytable.cfm';
const NYS_DETAIL_URL = 'https://statejobs.ny.gov/public/vacancyDetailsView.cfm';
const NYS_CONCURRENCY = 10; // parallel detail page fetches
const NYS_DETAIL_DELAY = 200; // ms between batches to be polite

const scrapeNysTable = async () => {
  const res = await axios.get(NYS_TABLE_URL, { timeout: 30000 });
  const $ = cheerio.load(res.data);
  const ids = [];
  $('#vacancyTable tbody tr').each((_, row) => {
    const id = $(row).find('td').eq(0).text().trim();
    if (id) ids.push(id);
  });
  return ids;
};

const scrapeNysDetail = async (vacancyId) => {
  const url = `${NYS_DETAIL_URL}?id=${vacancyId}`;
  const res = await axios.get(url, { timeout: 15000 });
  const $ = cheerio.load(res.data);
  const fields = { _detailUrl: url };
  $('p.row').each((_, row) => {
    const label = $(row).find('.leftCol').text().trim()
      .replace(/[\:\s]+$/, '').replace(/\s+/g, ' ');
    const value = $(row).find('.rightCol').text().trim().replace(/\s+/g, ' ');
    if (label && value) fields[label] = value;
  });
  return fields;
};

const refreshNysJobs = async (timestamp) => {
  console.log('[refresh] Fetching NYS jobs...');
  let vacancyIds;
  try {
    vacancyIds = await scrapeNysTable();
  } catch (err) {
    console.warn('[refresh] NYS table fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  console.log(`[refresh] Found ${vacancyIds.length} NYS vacancy IDs`);
  if (vacancyIds.length === 0) return { upserted: 0, modified: 0 };

  // Fetch detail pages in parallel batches
  const allJobs = [];
  for (let i = 0; i < vacancyIds.length; i += NYS_CONCURRENCY) {
    const batch = vacancyIds.slice(i, i + NYS_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((id) => scrapeNysDetail(id))
    );
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value['Vacancy ID']) {
        allJobs.push(result.value);
      }
    }
    if (i + NYS_CONCURRENCY < vacancyIds.length) {
      await new Promise((r) => setTimeout(r, NYS_DETAIL_DELAY));
    }
    // Log progress every 100 jobs
    if ((i + NYS_CONCURRENCY) % 100 === 0 || i + NYS_CONCURRENCY >= vacancyIds.length) {
      console.log(`[refresh] NYS detail pages: ${Math.min(i + NYS_CONCURRENCY, vacancyIds.length)}/${vacancyIds.length}`);
    }
  }

  console.log(`[refresh] Scraped ${allJobs.length} NYS job details`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const job = transformNysJob(raw);
      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'nys');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'nys' },
          update: {
            $set: {
              ...job,
              source: 'nys',
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

  console.log(`[refresh] NYS: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

const cleanupStaleJobs = async (timestamp, counts) => {
  // Safety: only clean up a source if we actually fetched a meaningful number of jobs.
  // If an API returned 0 (e.g. outage), don't purge that source's jobs.
  const sourceFilter = [];
  if (counts.nyc > 100) sourceFilter.push('nyc');
  if (counts.federal > 10) sourceFilter.push('federal');
  if (counts.nys > 50) sourceFilter.push('nys');

  if (sourceFilter.length === 0) {
    console.log('[refresh] Skipping cleanup — insufficient data from APIs');
    return 0;
  }

  const validSources = ['nyc', 'federal', 'nys'];
  const result = await Job.deleteMany({
    $or: [
      // Stale jobs from sources we successfully refreshed
      {
        source: { $in: sourceFilter },
        lastRefreshedAt: { $lt: timestamp },
        $or: [
          { savedBy: { $size: 0 } },
          { savedBy: { $exists: false } },
        ],
      },
      // Jobs with invalid/legacy sources (always remove)
      {
        source: { $nin: validSources },
        $or: [
          { savedBy: { $size: 0 } },
          { savedBy: { $exists: false } },
        ],
      },
    ],
  });
  console.log(`[refresh] Cleaned up ${result.deletedCount} stale jobs (sources refreshed: ${sourceFilter.join(', ')})`);
  return result.deletedCount;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const refreshAllJobs = async () => {
  const timestamp = new Date();
  console.log(`[refresh] Starting job refresh at ${timestamp.toISOString()}`);

  const nyc = await refreshNycJobs(timestamp);
  const federal = await refreshFederalJobs(timestamp);
  const nys = await refreshNysJobs(timestamp);

  const counts = {
    nyc: nyc.upserted + nyc.modified,
    federal: federal.upserted + federal.modified,
    nys: nys.upserted + nys.modified,
  };
  const staleCount = await cleanupStaleJobs(timestamp, counts);

  const totalJobs = await Job.estimatedDocumentCount();
  console.log(`[refresh] Done. DB now has ~${totalJobs} jobs. Stale removed: ${staleCount}`);

  return { nyc, federal, nys, staleCount, totalJobs };
};

// Run standalone
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoose = require('mongoose');

  (async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB');
      await refreshAllJobs();
    } catch (err) {
      console.error('Refresh failed:', err);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
  })();
}

module.exports = { refreshAllJobs };
