/**
 * Amtrak (SuccessFactors HTML scraping)
 */

const { axios, cheerio, Job, geocodeLocationBase, parseSalaryRange } = require('./utils');

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

  // Extract section content by h2 heading text (SuccessFactors pattern)
  const extractSection = (headingTexts) => {
    for (const text of headingTexts) {
      const heading = $('h2').filter((_, el) => $(el).text().trim().toLowerCase().includes(text.toLowerCase()));
      if (heading.length) {
        const parts = [];
        let next = heading.first().next();
        while (next.length && !next.is('h1, h2')) {
          const html = next.html();
          if (html) parts.push(html);
          next = next.next();
        }
        if (parts.length) return parts.join('\n');
      }
    }
    return null;
  };

  fields.description = extractSection(['Job Summary', 'Essential Functions', 'Description', 'Responsibilities']);
  fields.qualifications = extractSection(['Minimum Qualifications', 'Required Qualifications', 'Qualifications']);
  fields.preferredSkills = extractSection(['Preferred Qualifications', 'Preferred']);

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
      const params = { q: '', optionsFacetsDD_state: 'New York' };
      if (page > 1) params.startrow = (page - 1) * 25;

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

  // Deduplicate
  const seen = new Set();
  const uniqueJobs = allJobs.filter((j) => {
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

  const ops = uniqueJobs.map((raw) => {
    const detail = detailMap.get(raw.jobId) || {};
    const existing = existingJobs.find((j) => j.jobId === raw.jobId);

    const job = {
      jobId: raw.jobId,
      businessTitle: raw.title,
      agency: 'Amtrak',
      workLocation: detail.location || raw.location || 'New York',
      workLocation1: null,
      jobDescription: detail.description || existing?.jobDescription || null,
      minimumQualRequirements: detail.qualifications || null,
      preferredSkills: detail.preferredSkills || null,
      jobCategory: null,
      salaryRangeFrom: detail.salaryFrom || null,
      salaryRangeTo: detail.salaryTo || null,
      salaryFrequency: detail.salaryFrequency || null,
      fullTimePartTimeIndicator: detail.workType || null,
      postDate: null,
      externalUrl: raw.href ? `https://careers.amtrak.com${raw.href}` : null,
    };

    const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'amtrak');
    return {
      updateOne: {
        filter: { jobId: job.jobId, source: 'amtrak' },
        update: {
          $set: { ...job, source: 'amtrak', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
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
