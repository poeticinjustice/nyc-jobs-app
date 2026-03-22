/**
 * Frick Collection scraper — Paylocity platform.
 */

const { axios, Job, UPSERT_BATCH } = require('./utils');

const COMPANY_UUID = 'aba29db6-33d4-433d-b062-02c67cda2776';
const FRICK_URL = `https://recruiting.paylocity.com/recruiting/jobs/All/${COMPANY_UUID}/The-Frick-Collection`;

const refreshFrickJobs = async (timestamp) => {
  console.log('[refresh] Fetching Frick Collection jobs...');

  let html;
  try {
    const { data } = await axios.get(FRICK_URL, { timeout: 15000 });
    html = data;
  } catch (err) {
    console.warn('[refresh] Frick fetch failed:', err.message);
    return { upserted: 0, modified: 0 };
  }

  // Parse window.pageData JSON embedded in the HTML
  const pageDataMatch = html.match(/window\.pageData\s*=\s*({[\s\S]*?});?\s*<\/script>/);
  if (!pageDataMatch) {
    console.warn('[refresh] Frick: could not find window.pageData in HTML');
    return { upserted: 0, modified: 0 };
  }

  let pageData;
  try {
    pageData = JSON.parse(pageDataMatch[1]);
  } catch (err) {
    console.warn('[refresh] Frick: failed to parse pageData JSON:', err.message);
    return { upserted: 0, modified: 0 };
  }

  const rawJobs = pageData.Jobs || [];
  console.log(`[refresh] Found ${rawJobs.length} Frick Collection jobs`);
  if (rawJobs.length === 0) return { upserted: 0, modified: 0 };

  let totalUpserted = 0;
  let totalModified = 0;

  const coords = { lat: 40.7715, lng: -73.9673 }; // 1 East 70th Street, New York, NY

  for (let i = 0; i < rawJobs.length; i += UPSERT_BATCH) {
    const slice = rawJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const loc = raw.JobLocation || {};

      const job = {
        jobId: String(raw.JobId),
        businessTitle: raw.JobTitle || null,
        agency: 'The Frick Collection',
        workLocation: 'New York',
        workLocation1: [loc.Address, loc.City, loc.State, loc.Zip].filter(Boolean).join(', ') || '1 East 70th Street, New York, NY 10021',
        divisionWorkUnit: raw.HiringDepartment || null,
        jobDescription: null, // Paylocity detail pages are React SPAs — can't scrape without browser
        jobCategory: null,
        salaryRangeFrom: null,
        salaryRangeTo: null,
        salaryFrequency: null,
        fullTimePartTimeIndicator: null,
        postDate: raw.PublishedDate ? new Date(raw.PublishedDate) : null,
        externalUrl: `https://recruiting.paylocity.com/Recruiting/Jobs/Details/${COMPANY_UUID}/${raw.JobId}`,
      };

      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'frick' },
          update: {
            $set: { ...job, source: 'frick', coordinates: coords, lastRefreshedAt: timestamp },
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

  console.log(`[refresh] Frick: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshFrickJobs;
