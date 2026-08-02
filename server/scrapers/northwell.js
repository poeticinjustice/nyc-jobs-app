/**
 * Northwell Health (Oracle HCM REST API)
 */

const { axios, safeDate, batchUpsert } = require('./utils');

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

  const jobs = metroJobs.map((raw) => ({
    jobId: String(raw.Id),
    businessTitle: raw.Title || null,
    agency: 'Northwell Health',
    workLocation: raw.PrimaryLocation || null,
    workLocation1: null,
    jobDescription: raw.ShortDescriptionStr || null,
    jobCategory: null,
    // The Oracle HCM feed carries no salary figures at all — verified against
    // both the list and detail endpoints, so these stay null by design.
    salaryRangeFrom: null,
    salaryRangeTo: null,
    salaryFrequency: null,
    fullTimePartTimeIndicator: raw.WorkplaceTypeCode || null,
    postDate: safeDate(raw.PostedDate),
    postUntil: safeDate(raw.PostingEndDate),
    externalUrl: `https://eppr.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2/job/${raw.Id}`,
  }));

  return batchUpsert(jobs, 'northwell', timestamp, 'Northwell');
};

module.exports = refreshNorthwellJobs;
