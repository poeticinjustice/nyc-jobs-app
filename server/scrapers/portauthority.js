/**
 * Port Authority of NY/NJ Jobs (Jobvite)
 */

const { axios, cheerio, parseSalaryRange, safeDate, batchUpsert } = require('./utils');

const PA_LISTING_URL = 'https://jobs.jobvite.com/panynj/jobs';
const PA_DETAIL_BASE = 'https://jobs.jobvite.com/panynj/job';
const PA_CONCURRENCY = 5;
const PA_DETAIL_DELAY = 300;

const refreshPortAuthorityJobs = async (timestamp) => {
  console.log('[refresh] Fetching Port Authority jobs...');

  let listingHtml;
  try {
    const { data } = await axios.get(PA_LISTING_URL, { timeout: 15000 });
    listingHtml = data;
  } catch (err) {
    console.warn('[refresh] Port Authority listing fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  // Extract job IDs from listing page links
  const $ = cheerio.load(listingHtml);
  const jobIds = new Set();
  $('a[href*="/panynj/job/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/panynj\/job\/([a-zA-Z0-9]+)/);
    if (match) jobIds.add(match[1]);
  });

  const ids = [...jobIds];
  console.log(`[refresh] Found ${ids.length} Port Authority job IDs`);
  if (ids.length === 0) return { upserted: 0, modified: 0 };

  // Fetch detail pages for JSON-LD
  const allJobs = [];
  for (let i = 0; i < ids.length; i += PA_CONCURRENCY) {
    const batch = ids.slice(i, i + PA_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const { data } = await axios.get(`${PA_DETAIL_BASE}/${id}`, { timeout: 15000 });
        const $d = cheerio.load(data);
        let jsonLd = {};
        $d('script[type="application/ld+json"]').each((_, el) => {
          try {
            const parsed = JSON.parse($d(el).html());
            if (parsed['@type'] === 'JobPosting') jsonLd = parsed;
          } catch { /* ignore */ }
        });
        return { id, jsonLd };
      })
    );
    for (const result of results) {
      if (result.status === 'fulfilled') allJobs.push(result.value);
    }
    if (i + PA_CONCURRENCY < ids.length) {
      await new Promise((r) => setTimeout(r, PA_DETAIL_DELAY));
    }
  }

  console.log(`[refresh] Scraped ${allJobs.length} Port Authority job details`);

  const jobs = allJobs.map((raw) => {
    const ld = raw.jsonLd || {};
    const loc = ld.jobLocation?.[0]?.address || {};

    // Parse salary from description HTML
    const { from: salaryFrom, to: salaryTo } = parseSalaryRange(ld.description || '');

    return {
      jobId: raw.id,
      businessTitle: ld.title || null,
      agency: 'Port Authority of NY & NJ',
      workLocation: loc.addressLocality || 'New York',
      workLocation1: [loc.addressLocality, loc.addressRegion].filter(Boolean).join(', ') || null,
      jobDescription: ld.description || null,
      jobCategory: ld.industry || null,
      salaryRangeFrom: salaryFrom,
      salaryRangeTo: salaryTo,
      salaryFrequency: salaryFrom ? 'Annual' : null,
      fullTimePartTimeIndicator: ld.employmentType || null,
      postDate: safeDate(ld.datePosted),
      externalUrl: `${PA_DETAIL_BASE}/${raw.id}`,
    };
  });

  return batchUpsert(jobs, 'pa', timestamp, 'Port Authority');
};

module.exports = refreshPortAuthorityJobs;
