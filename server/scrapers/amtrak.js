/**
 * Amtrak (SuccessFactors HTML scraping)
 */

const { axios, cheerio, Job, geocodeLocationBase, parseSalaryRange, omitUndefined } = require('./utils');

const AMTRAK_SEARCH_URL = 'https://careers.amtrak.com/search/';
const AMTRAK_DETAIL_CONCURRENCY = 5;
const AMTRAK_DETAIL_DELAY = 300;

const scrapeAmtrakDetail = async (url) => {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    timeout: 15000,
  });
  const $ = cheerio.load(data);
  const fields = {};
  const bodyText = $('body').text();

  // SuccessFactors detail pages have no content <h2>s (the only h2s are footer
  // nav) — the entire posting lives in a .jobdescription container with
  // <strong> labels. Store its HTML as the description.
  const descContainer = $('.jobdescription').first().length
    ? $('.jobdescription').first()
    : $('.jobDisplay').first();
  const descHtml = descContainer.length ? (descContainer.html() || '').trim() : null;
  fields.description = descHtml && descHtml.length > 50 ? descHtml : null;

  // Salary
  const { from: salaryFrom, to: salaryTo, frequency: salaryFrequency } = parseSalaryRange(bodyText);
  fields.salaryFrom = salaryFrom;
  fields.salaryTo = salaryTo;
  fields.salaryFrequency = salaryFrequency;

  // Location from page (more specific than URL-derived)
  const locMatch = bodyText.match(/Location[:\s]+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/);
  if (locMatch) fields.location = locMatch[1].trim();

  // Work type
  const typeMatch = bodyText.match(/(?:Employment Type|Work Arrangement)[:\s]+([^\n]+)/i);
  if (typeMatch) fields.workType = typeMatch[1].trim();

  return fields;
};

const refreshAmtrakJobs = async (timestamp) => {
  console.log('[refresh] Fetching Amtrak jobs...');

  let allJobs = [];
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      // No state facet param: the site ignores it AND its presence breaks
      // startrow pagination (verified live) — every "page" repeats page 1.
      // Fetch the national list paginated and filter to NY by URL slug below.
      const params = { q: '', startrow: (page - 1) * 25 };

      const { data } = await axios.get(AMTRAK_SEARCH_URL, {
        params,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        timeout: 15000,
      });

      const $ = cheerio.load(data);
      const jobsOnPage = [];

      $('a[href*="/job/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const title = $(el).text().trim();
        if (!title || title.length < 5 || jobsOnPage.find((j) => j.href === href)) return;

        // Extract location from URL pattern: /job/City-Title-State-Zip/id/
        const locMatch = href.match(/\/job\/([^/]+)/);
        let location = 'New York';
        if (locMatch) {
          const parts = locMatch[1].split('-');
          // First part is usually the city
          location = parts[0].replace(/%28/g, '(').replace(/%29/g, ')');
        }

        // Extract job ID from URL
        const idMatch = href.match(/\/(\d+)\/?$/);
        const jobId = idMatch ? idMatch[1] : href;

        jobsOnPage.push({ jobId, title, href, location });
      });

      allJobs.push(...jobsOnPage);
      hasMore = jobsOnPage.length >= 25;
      page++;
      if (page > 10) break; // safety
    }
  } catch (err) {
    console.warn('[refresh] Amtrak fetch error (partial data may be used):', err.message);
  }

  // The site ignores the state facet param and returns the national list
  // (verified live: Chicago/New Orleans/DC results for a New York query), so
  // filter by the state token in the URL slug: /job/City-Title-Id-City-ST-Zip/id/
  const nyJobs = allJobs.filter((j) => {
    const stateMatch = j.href.match(/-([A-Z]{2})-\d{5}(?:-\d{4})?\/\d+\/?$/) || j.href.match(/-([A-Z]{2})-\d{5}/);
    return stateMatch ? stateMatch[1] === 'NY' : false;
  });
  console.log(`[refresh] Amtrak: ${nyJobs.length} NY jobs of ${allJobs.length} listed`);

  // Deduplicate
  const seen = new Set();
  const uniqueJobs = nyJobs.filter((j) => {
    if (seen.has(j.jobId)) return false;
    seen.add(j.jobId);
    return true;
  });

  console.log(`[refresh] Fetched ${uniqueJobs.length} Amtrak NY jobs`);
  if (uniqueJobs.length === 0) return { upserted: 0, modified: 0 };

  // Fetch detail pages for jobs missing descriptions
  const existingJobs = await Job.find(
    { source: 'amtrak', jobId: { $in: uniqueJobs.map((j) => j.jobId) } },
    { jobId: 1, jobDescription: 1 }
  ).lean();
  const hasDesc = new Set(existingJobs.filter((j) => j.jobDescription).map((j) => j.jobId));

  const needsDetail = uniqueJobs.filter((j) => !hasDesc.has(j.jobId) && j.href);
  console.log(`[refresh] Amtrak: fetching ${needsDetail.length} detail pages (${uniqueJobs.length - needsDetail.length} cached)`);

  const detailMap = new Map();
  for (let i = 0; i < needsDetail.length; i += AMTRAK_DETAIL_CONCURRENCY) {
    const batch = needsDetail.slice(i, i + AMTRAK_DETAIL_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((j) => scrapeAmtrakDetail(`https://careers.amtrak.com${j.href}`))
    );
    for (let k = 0; k < results.length; k++) {
      if (results[k].status === 'fulfilled' && results[k].value) {
        detailMap.set(batch[k].jobId, results[k].value);
      }
    }
    if (i + AMTRAK_DETAIL_CONCURRENCY < needsDetail.length) {
      await new Promise((r) => setTimeout(r, AMTRAK_DETAIL_DELAY));
    }
  }

  let totalUpserted = 0;
  let totalModified = 0;

  const existingById = new Map(existingJobs.map((j) => [j.jobId, j]));
  const ops = uniqueJobs.map((raw) => {
    const hasDetail = detailMap.has(raw.jobId);
    const detail = detailMap.get(raw.jobId) || {};
    const existing = existingById.get(raw.jobId);

    // Detail-derived fields: undefined = keep stored values for cached jobs
    // whose detail page wasn't refetched this run (omitUndefined strips them).
    const keep = (value) => (hasDetail || !existing ? (value ?? null) : undefined);

    const job = {
      jobId: raw.jobId,
      businessTitle: raw.title,
      agency: 'Amtrak',
      workLocation: hasDetail || !existing ? (detail.location || raw.location || 'New York') : undefined,
      workLocation1: null,
      jobDescription: detail.description || existing?.jobDescription || undefined,
      minimumQualRequirements: keep(detail.qualifications),
      preferredSkills: keep(detail.preferredSkills),
      jobCategory: null,
      salaryRangeFrom: keep(detail.salaryFrom),
      salaryRangeTo: keep(detail.salaryTo),
      salaryFrequency: keep(detail.salaryFrequency),
      fullTimePartTimeIndicator: keep(detail.workType),
      postDate: null,
      externalUrl: raw.href ? `https://careers.amtrak.com${raw.href}` : null,
    };

    const coords = job.workLocation !== undefined
      ? geocodeLocationBase(job.workLocation, job.workLocation1, 'amtrak')
      : undefined;
    return {
      updateOne: {
        filter: { jobId: job.jobId, source: 'amtrak' },
        update: {
          $set: omitUndefined({ ...job, source: 'amtrak', coordinates: coords === undefined ? undefined : (coords || { lat: null, lng: null }), lastRefreshedAt: timestamp }),
          $setOnInsert: { savedBy: [] },
        },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted = result.upsertedCount;
    totalModified = result.modifiedCount;
  }

  console.log(`[refresh] Amtrak: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshAmtrakJobs;
