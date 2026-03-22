/**
 * AMNH scraper — American Museum of Natural History (PeopleAdmin Atom feed).
 */

const { axios, cheerio, Job, parseSalaryRange } = require('./utils');

const AMNH_FEED_URL = 'https://careers.amnh.org/postings/all_jobs.atom';

const refreshAmnhJobs = async (timestamp) => {
  console.log('[refresh] Fetching AMNH jobs...');

  let feedData;
  try {
    const { data } = await axios.get(AMNH_FEED_URL, { timeout: 15000 });
    feedData = data;
  } catch (err) {
    console.warn('[refresh] AMNH feed fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  const $ = cheerio.load(feedData, { xmlMode: true });
  const entries = [];
  $('entry').each((_, el) => {
    const id = $(el).find('id').text().trim();
    const postingId = id.match(/postings\/(\d+)/)?.[1];
    if (!postingId) return;

    const contentHtml = $(el).find('content').text().trim();
    const department = $(el).find('author name').text().trim().replace(/\s*-\s*\d+$/, '');

    entries.push({
      postingId,
      title: $(el).find('title').text().trim(),
      department,
      contentHtml,
      postDate: $(el).find('published').text().trim(),
      url: $(el).find('link[rel="alternate"]').attr('href') || id,
    });
  });

  console.log(`[refresh] Found ${entries.length} AMNH jobs in feed`);
  if (entries.length === 0) return { upserted: 0, modified: 0 };

  let totalUpserted = 0;
  let totalModified = 0;

  const ops = entries.map((raw) => {
    // Parse salary from content HTML text — AMNH embeds salary as e.g. "$90,000/annual - $100,000/annual"
    const contentText = cheerio.load(raw.contentHtml).text();
    const { from: salaryFrom, to: salaryTo, frequency: salaryFrequency } = parseSalaryRange(contentText);
    // Also handle single rate like "$20/hour"
    let finalSalaryFrom = salaryFrom;
    let finalSalaryTo = salaryTo;
    let finalSalaryFrequency = salaryFrequency;
    if (!salaryFrom) {
      const hourlyMatch = contentText.match(/\$\s*([\d,]+(?:\.\d+)?)\s*\/\s*hour/i);
      if (hourlyMatch) {
        finalSalaryFrom = parseFloat(hourlyMatch[1].replace(/,/g, ''));
        finalSalaryTo = finalSalaryFrom;
        finalSalaryFrequency = 'Hourly';
      }
    }

    const job = {
      jobId: raw.postingId,
      businessTitle: raw.title,
      agency: 'American Museum of Natural History',
      workLocation: 'New York',
      workLocation1: 'Central Park West at 79th Street, New York, NY',
      divisionWorkUnit: raw.department || null,
      jobDescription: raw.contentHtml || null,
      jobCategory: null,
      salaryRangeFrom: finalSalaryFrom,
      salaryRangeTo: finalSalaryTo,
      salaryFrequency: finalSalaryFrequency,
      fullTimePartTimeIndicator: null,
      postDate: raw.postDate ? new Date(raw.postDate) : null,
      externalUrl: raw.url,
    };

    const coords = { lat: 40.7813, lng: -73.9740 }; // AMNH location
    return {
      updateOne: {
        filter: { jobId: job.jobId, source: 'amnh' },
        update: {
          $set: { ...job, source: 'amnh', coordinates: coords, lastRefreshedAt: timestamp },
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

  console.log(`[refresh] AMNH: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshAmnhJobs;
