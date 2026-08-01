/**
 * NYS Jobs scraper — scrapes StateJobsNY vacancy table and detail pages.
 */

const { axios, cheerio, Job, geocodeLocationBase, UPSERT_BATCH } = require('./utils');
const { transformNysJob } = require('../helpers/jobHelpers');

const NYS_TABLE_URL = 'https://statejobs.ny.gov/public/vacancytable.cfm';
const NYS_DETAIL_URL = 'https://statejobs.ny.gov/public/vacancyDetailsView.cfm';
const NYS_CONCURRENCY = 10; // parallel detail page fetches
const NYS_DETAIL_DELAY = 200; // ms between batches to be polite

// Only keep NYS jobs in the NYC metro area (5 boroughs + surrounding counties)
const NYC_METRO_COUNTIES = new Set([
  'new york', 'kings', 'queens', 'bronx', 'richmond',       // 5 boroughs
  'nassau', 'suffolk', 'westchester', 'rockland',            // inner suburbs
  'putnam', 'orange', 'dutchess',                            // outer suburbs
]);

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
  let failedDetails = 0;
  for (let i = 0; i < vacancyIds.length; i += NYS_CONCURRENCY) {
    const batch = vacancyIds.slice(i, i + NYS_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((id) => scrapeNysDetail(id))
    );
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value['Vacancy ID']) {
        allJobs.push(result.value);
      } else {
        failedDetails++;
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

  if (failedDetails > 0) {
    console.warn(`[refresh] NYS: ${failedDetails}/${vacancyIds.length} detail pages failed or were empty`);
  }
  console.log(`[refresh] Scraped ${allJobs.length} NYS job details`);

  // Filter to NYC metro area only
  const metroJobs = allJobs.filter((raw) => {
    const county = (raw['County'] || '').toLowerCase().trim();
    return NYC_METRO_COUNTIES.has(county);
  });
  console.log(`[refresh] NYS metro area jobs: ${metroJobs.length}/${allJobs.length}`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < metroJobs.length; i += UPSERT_BATCH) {
    const slice = metroJobs.slice(i, i + UPSERT_BATCH);
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

module.exports = refreshNysJobs;
