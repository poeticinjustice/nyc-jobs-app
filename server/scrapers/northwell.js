/**
 * Northwell Health (Oracle HCM REST API)
 */

const { axios, Job, geocodeLocationBase, UPSERT_BATCH } = require('./utils');

const NORTHWELL_API_URL = 'https://eppr.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions';
const NORTHWELL_PAGE_SIZE = 25;

const refreshNorthwellJobs = async (timestamp) => {
  console.log('[refresh] Fetching Northwell jobs...');

  let allJobs = [];
  let offset = 0;
  let totalJobs = 0;

  try {
    while (true) {
      const { data } = await axios.get(NORTHWELL_API_URL, {
        params: {
          onlyData: true,
          expand: 'requisitionList.secondaryLocations,flexFieldsFacet.values',
          finder: `findReqs;siteNumber=CX_2,facetsList=LOCATIONS;WORK_LOCATIONS;WORKPLACE_TYPES;TITLES;CATEGORIES;ORGANIZATIONS;POSTING_DATES;FLEX_FIELDS,limit=${NORTHWELL_PAGE_SIZE},offset=${offset}`,
        },
        timeout: 30000,
      });

      const items = data.items?.[0]?.requisitionList || [];
      if (offset === 0) {
        totalJobs = data.items?.[0]?.TotalJobsCount || 0;
        console.log(`[refresh] Northwell: ${totalJobs} total jobs`);
      }

      if (items.length === 0) break;
      allJobs.push(...items);
      offset += NORTHWELL_PAGE_SIZE;
      if (offset >= totalJobs || offset > 5000) break;
    }
  } catch (err) {
    console.warn('[refresh] Northwell fetch error (partial data may be used):', err.message);
  }

  // Filter to NYC metro area — use state-based check instead of substring county match
  const metroJobs = allJobs.filter((j) => {
    const loc = (j.PrimaryLocation || '').toLowerCase();
    // Northwell locations are "City, State, Country" — keep NY/NJ only
    return loc.includes(', ny,') || loc.endsWith(', ny') || loc.includes('new york') ||
      loc.includes(', nj,') || loc.endsWith(', nj');
  });
  console.log(`[refresh] Northwell metro area jobs: ${metroJobs.length}/${allJobs.length}`);

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < metroJobs.length; i += UPSERT_BATCH) {
    const slice = metroJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const job = {
        jobId: String(raw.Id),
        businessTitle: raw.Title || null,
        agency: 'Northwell Health',
        workLocation: raw.PrimaryLocation || null,
        workLocation1: null,
        jobDescription: raw.ShortDescriptionStr || null,
        jobCategory: null,
        salaryRangeFrom: null,
        salaryRangeTo: null,
        salaryFrequency: null,
        fullTimePartTimeIndicator: raw.WorkplaceTypeCode || null,
        postDate: raw.PostedDate || null,
        postUntil: raw.PostingEndDate || null,
        externalUrl: `https://eppr.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2/job/${raw.Id}`,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'northwell');
      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'northwell' },
          update: {
            $set: { ...job, source: 'northwell', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
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

  console.log(`[refresh] Northwell: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshNorthwellJobs;
