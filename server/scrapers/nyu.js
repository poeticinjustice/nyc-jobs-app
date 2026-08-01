const { axios, cheerio, Job, geocodeLocationBase, UPSERT_BATCH, parseSalaryRange, safeDate } = require('./utils');

// ---------------------------------------------------------------------------
// NYU Jobs (iCIMS)
// ---------------------------------------------------------------------------

const NYU_SEARCH_URL = 'https://uscareers-nyu.icims.com/jobs/search';
const NYU_DETAIL_URL = 'https://uscareers-nyu.icims.com/jobs';
const NYU_CONCURRENCY = 5;
const NYU_DETAIL_DELAY = 300;

const scrapeNyuListingPage = async (page) => {
  const { data } = await axios.get(NYU_SEARCH_URL, {
    params: { pr: page, in_iframe: 1 },
    timeout: 15000,
  });
  const $ = cheerio.load(data);
  const jobs = [];

  // iCIMS listing rows contain links to /jobs/{id}/title-slug/job
  $('a[href*="/jobs/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/jobs\/(\d+)\//);
    if (match) {
      const id = match[1];
      if (!jobs.find((j) => j.id === id)) {
        jobs.push({ id, title: $(el).text().trim(), href });
      }
    }
  });

  // Check if there's a next page
  const hasMore = $('a[title="next"]').length > 0 || $('a:contains("Next")').length > 0;
  return { jobs, hasMore };
};

const scrapeNyuDetail = async (jobId) => {
  const { data } = await axios.get(`${NYU_DETAIL_URL}/${jobId}/job`, { timeout: 15000 });
  const $ = cheerio.load(data);

  // Extract JSON-LD
  let jsonLd = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html());
      if (parsed['@type'] === 'JobPosting') jsonLd = parsed;
    } catch { /* ignore */ }
  });

  // Parse salary from page text
  const { from: salaryFrom, to: salaryTo, frequency: salaryFrequency } = parseSalaryRange($.text());

  return { jsonLd, salaryFrom, salaryTo, salaryFrequency };
};

const refreshNyuJobs = async (timestamp) => {
  console.log('[refresh] Fetching NYU jobs...');

  // Phase 1: get all job IDs from listing pages
  const allJobIds = [];
  let page = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const result = await scrapeNyuListingPage(page);
      allJobIds.push(...result.jobs);
      hasMore = result.hasMore && result.jobs.length > 0;
      page++;
      if (page > 50) break; // safety limit
    }
  } catch (err) {
    console.warn('[refresh] NYU listing fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  // Dedupe across pages — the same job can appear on multiple listing pages,
  // and duplicate upsert ops in one bulkWrite can throw E11000 on the unique index.
  {
    const seenIds = new Set();
    const deduped = allJobIds.filter((j) => {
      if (seenIds.has(j.id)) return false;
      seenIds.add(j.id);
      return true;
    });
    if (deduped.length < allJobIds.length) {
      console.log(`[refresh] NYU: removed ${allJobIds.length - deduped.length} duplicate listings across pages`);
    }
    allJobIds.length = 0;
    allJobIds.push(...deduped);
  }

  console.log(`[refresh] Found ${allJobIds.length} NYU job IDs`);
  if (allJobIds.length === 0) return { upserted: 0, modified: 0 };

  // Phase 2: fetch detail pages in batches
  const allJobs = [];
  for (let i = 0; i < allJobIds.length; i += NYU_CONCURRENCY) {
    const batch = allJobIds.slice(i, i + NYU_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((j) => scrapeNyuDetail(j.id))
    );
    for (let k = 0; k < results.length; k++) {
      if (results[k].status === 'fulfilled') {
        allJobs.push({ ...batch[k], ...results[k].value });
      }
    }
    if (i + NYU_CONCURRENCY < allJobIds.length) {
      await new Promise((r) => setTimeout(r, NYU_DETAIL_DELAY));
    }
    if ((i + NYU_CONCURRENCY) % 50 === 0 || i + NYU_CONCURRENCY >= allJobIds.length) {
      console.log(`[refresh] NYU detail pages: ${Math.min(i + NYU_CONCURRENCY, allJobIds.length)}/${allJobIds.length}`);
    }
  }

  console.log(`[refresh] Scraped ${allJobs.length} NYU job details`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const ld = raw.jsonLd || {};
      const loc = ld.jobLocation?.[0]?.address || {};

      const job = {
        jobId: raw.id,
        businessTitle: ld.title || raw.title,
        agency: 'New York University',
        workLocation: loc.addressLocality || null,
        workLocation1: [loc.addressLocality, loc.addressRegion].filter(Boolean).join(', ') || null,
        jobDescription: ld.description || null,
        jobCategory: ld.occupationalCategory || null,
        salaryRangeFrom: raw.salaryFrom,
        salaryRangeTo: raw.salaryTo,
        salaryFrequency: raw.salaryFrom ? (raw.salaryFrequency || 'Annual') : null,
        fullTimePartTimeIndicator: ld.employmentType || null,
        postDate: safeDate(ld.datePosted),
        postUntil: safeDate(ld.validThrough),
        externalUrl: ld.url || `${NYU_DETAIL_URL}/${raw.id}/job`,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'nyu');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'nyu' },
          update: {
            $set: { ...job, source: 'nyu', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
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

  console.log(`[refresh] NYU: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshNyuJobs;
