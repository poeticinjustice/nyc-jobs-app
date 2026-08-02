/**
 * Mount Sinai Health System (Jibe JSON API)
 */

const { axios, safeDate, batchUpsert } = require('./utils');

const MOUNTSINAI_API_URL = 'https://careers.mountsinai.org/api/jobs';
const MOUNTSINAI_PAGE_SIZE = 100;

const refreshMountSinaiJobs = async (timestamp) => {
  console.log('[refresh] Fetching Mount Sinai jobs...');

  let allJobs = [];
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const { data } = await axios.get(MOUNTSINAI_API_URL, {
        params: { page, limit: MOUNTSINAI_PAGE_SIZE },
        timeout: 30000,
      });

      if (page === 1) {
        console.log(`[refresh] Mount Sinai: ${data.totalCount || 0} total jobs`);
      }

      const jobs = data.jobs || [];
      if (jobs.length === 0) {
        hasMore = false;
      } else {
        allJobs.push(...jobs);
        page++;
      }
      if (page > 100) break; // safety
    }
  } catch (err) {
    console.warn('[refresh] Mount Sinai fetch error (partial data may be used):', err.message);
  }

  console.log(`[refresh] Fetched ${allJobs.length} Mount Sinai jobs`);

  // Filter to NYC metro area only
  const metroJobs = allJobs.filter((j) => {
    const d = j.data || {};
    const state = (d.state || '').toUpperCase();
    return state === 'NY' || state === 'NJ';
  });
  console.log(`[refresh] Mount Sinai metro area jobs: ${metroJobs.length}/${allJobs.length}`);

  const jobs = metroJobs.map((raw) => {
    const d = raw.data || {};
    return {
      jobId: d.req_id || d.slug,
      businessTitle: d.title || null,
      agency: d.brand || 'Mount Sinai Health System',
      workLocation: d.city || null,
      workLocation1: d.full_location || d.short_location || null,
      divisionWorkUnit: d.department || null,
      jobDescription: d.description || null,
      minimumQualRequirements: d.qualifications || null,
      jobCategory: d.categories?.[0]?.name || null,
      salaryRangeFrom: d.salary_min_value || null,
      salaryRangeTo: d.salary_max_value || null,
      salaryFrequency: d.salary_min_value ? (d.salary_min_value >= 1000 ? 'Annual' : 'Hourly') : null,
      fullTimePartTimeIndicator: d.employment_type === 'FULL_TIME' ? 'Full-Time' : d.employment_type === 'PART_TIME' ? 'Part-Time' : d.employment_type || null,
      postDate: safeDate(d.posted_date),
      externalUrl: d.apply_url || d.meta_data?.canonical_url || null,
      _lat: d.latitude ? parseFloat(d.latitude) : null,
      _lng: d.longitude ? parseFloat(d.longitude) : null,
    };
  });

  return batchUpsert(jobs, 'mountsinai', timestamp, 'Mount Sinai');
};

module.exports = refreshMountSinaiJobs;
