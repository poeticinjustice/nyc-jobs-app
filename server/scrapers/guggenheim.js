/**
 * Guggenheim Museum scraper — The Applicant Manager platform.
 */

const { axios, cheerio, Job, UPSERT_BATCH, parseSalaryRange } = require('./utils');

const GUGGENHEIM_LISTING_URL = 'https://theapplicantmanager.com/careers?co=ny';
const GUGGENHEIM_CONCURRENCY = 3;
const GUGGENHEIM_DETAIL_DELAY = 300;

const scrapeGuggenheimListing = async () => {
  const { data } = await axios.get(GUGGENHEIM_LISTING_URL, { timeout: 15000 });
  const $ = cheerio.load(data);
  const jobs = [];

  $('a[href*="jobs?pos="]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/jobs\?pos=(NY\w+)/i);
    if (!match) return;
    const posCode = match[1];
    // Skip general resume submission
    if (/^ny0000$/i.test(posCode)) return;
    if (!jobs.find((j) => j.posCode === posCode)) {
      jobs.push({ posCode, title: $(el).text().trim() });
    }
  });

  return jobs;
};

const scrapeGuggenheimDetail = async (posCode) => {
  const url = `https://theapplicantmanager.com/jobs?pos=${posCode}`;
  const { data } = await axios.get(url, { timeout: 15000 });
  const $ = cheerio.load(data);

  const bodyText = $('body').text();

  // Parse salary
  const { from: salaryFrom, to: salaryTo, frequency: salaryFrequency } = parseSalaryRange(bodyText);

  // Parse location
  const locationMatch = bodyText.match(/Location:\s*([^\n]+)/);
  const location = locationMatch ? locationMatch[1].trim() : null;

  // Parse employment type
  const typeMatch = bodyText.match(/(Full-[Tt]ime|Part-[Tt]ime|On-Call|Temporary|Non-Exempt|Exempt)/);
  const employmentType = typeMatch ? typeMatch[1] : null;

  // The posting lives in div.job_listing. There is no <main> on this page, so
  // the previous fallback chain ended at $('body').html() and stored ~46KB of
  // nav, the application form, and inline scripts as the job description.
  const listing = $('div.job_listing').first();
  const description = listing.length ? (listing.html() || '').trim() || null : null;

  return { salaryFrom, salaryTo, salaryFrequency, location, employmentType, description };
};

const refreshGuggenheimJobs = async (timestamp) => {
  console.log('[refresh] Fetching Guggenheim jobs...');

  let listings;
  try {
    listings = await scrapeGuggenheimListing();
  } catch (err) {
    console.warn('[refresh] Guggenheim listing fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  console.log(`[refresh] Found ${listings.length} Guggenheim job listings`);
  if (listings.length === 0) return { upserted: 0, modified: 0 };

  // Fetch detail pages in batches
  const allJobs = [];
  for (let i = 0; i < listings.length; i += GUGGENHEIM_CONCURRENCY) {
    const batch = listings.slice(i, i + GUGGENHEIM_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((j) => scrapeGuggenheimDetail(j.posCode))
    );
    for (let k = 0; k < results.length; k++) {
      if (results[k].status === 'fulfilled') {
        allJobs.push({ ...batch[k], ...results[k].value });
      }
    }
    if (i + GUGGENHEIM_CONCURRENCY < listings.length) {
      await new Promise((r) => setTimeout(r, GUGGENHEIM_DETAIL_DELAY));
    }
    if ((i + GUGGENHEIM_CONCURRENCY) % 30 === 0 || i + GUGGENHEIM_CONCURRENCY >= listings.length) {
      console.log(`[refresh] Guggenheim detail pages: ${Math.min(i + GUGGENHEIM_CONCURRENCY, listings.length)}/${listings.length}`);
    }
  }

  console.log(`[refresh] Scraped ${allJobs.length} Guggenheim job details`);

  let totalUpserted = 0;
  let totalModified = 0;

  const coords = { lat: 40.7830, lng: -73.9590 }; // Guggenheim Museum

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const job = {
        jobId: raw.posCode,
        businessTitle: raw.title || null,
        agency: 'Solomon R. Guggenheim Museum',
        workLocation: raw.location || 'New York',
        workLocation1: raw.location || null,
        jobDescription: raw.description || null,
        jobCategory: null,
        salaryRangeFrom: raw.salaryFrom,
        salaryRangeTo: raw.salaryTo,
        salaryFrequency: raw.salaryFrequency,
        fullTimePartTimeIndicator: raw.employmentType || null,
        externalUrl: `https://theapplicantmanager.com/jobs?pos=${raw.posCode}`,
      };

      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'guggenheim' },
          update: {
            $set: { ...job, source: 'guggenheim', coordinates: coords, lastRefreshedAt: timestamp },
            // The listing exposes no posted date — stamp first-seen so date sorting works.
            $setOnInsert: { savedBy: [], postDate: timestamp },
          },
          upsert: true,
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] Guggenheim: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshGuggenheimJobs;
