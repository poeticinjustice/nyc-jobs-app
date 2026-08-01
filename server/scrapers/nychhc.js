/**
 * NYC Health + Hospitals — Provider/Clinical Jobs (custom REST API)
 *
 * Covers physician, NP, allied health, and clinical roles posted on
 * providercareers.nychealthandhospitals.org.  The non-provider (admin/nursing)
 * careers sit behind a PeopleSoft login wall and are not scrapable.
 */

const { axios, Job, parseSalaryRange, safeDate, batchUpsert } = require('./utils');

const NYCHHC_API_BASE = 'https://providercareers.nychealthandhospitals.org/api/job';
const NYCHHC_PAGE_SIZE = 50;

const fetchJobDetail = async (id) => {
  try {
    const { data } = await axios.get(`${NYCHHC_API_BASE}/${id}`, { timeout: 15000 });
    return data;
  } catch {
    return null;
  }
};

const refreshNychhcJobs = async (timestamp) => {
  console.log('[refresh] Fetching NYC H+H provider jobs...');

  let allJobs = [];
  let page = 1;
  let totalPages = 1;

  try {
    while (page <= totalPages) {
      const { data } = await axios.post(`${NYCHHC_API_BASE}/search`, {
        pageIndex: page,
        pageSize: NYCHHC_PAGE_SIZE,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      const meta = data?.metadata;
      if (page === 1) {
        totalPages = meta?.totalPages || 1;
        console.log(`[refresh] NYC H+H: ${meta?.totalCount || 0} total provider jobs, ${totalPages} pages`);
      }

      const results = data?.results || [];
      if (results.length === 0) break;
      allJobs.push(...results);
      page++;
      if (page > 100) break; // safety
    }
  } catch (err) {
    console.warn('[refresh] NYC H+H fetch error (partial data may be used):', err.message);
  }

  console.log(`[refresh] Fetched ${allJobs.length} NYC H+H provider jobs`);

  // Only fetch details for jobs we don't already have a description for —
  // previously every job's detail endpoint was hit on every 6-hour run.
  const jobIdOf = (raw) => raw.jobId?.toString() || raw.id;
  const existingJobs = await Job.find(
    { source: 'nychhc', jobId: { $in: allJobs.map(jobIdOf) } },
    { jobId: 1, jobDescription: 1 }
  ).lean();
  const existingById = new Map(existingJobs.map((j) => [j.jobId, j]));
  const hasDesc = new Set(existingJobs.filter((j) => j.jobDescription).map((j) => j.jobId));

  const needsDetail = allJobs.filter((raw) => !hasDesc.has(jobIdOf(raw)));
  console.log(`[refresh] NYC H+H: fetching ${needsDetail.length} detail pages (${allJobs.length - needsDetail.length} cached)`);

  const DETAIL_CONCURRENCY = 5;
  const DETAIL_DELAY = 200;
  for (let i = 0; i < needsDetail.length; i += DETAIL_CONCURRENCY) {
    const batch = needsDetail.slice(i, i + DETAIL_CONCURRENCY);
    const details = await Promise.all(batch.map((j) => fetchJobDetail(j.id)));
    details.forEach((detail, idx) => {
      if (detail) batch[idx]._detail = detail;
    });
    if (i + DETAIL_CONCURRENCY < needsDetail.length) {
      await new Promise((r) => setTimeout(r, DETAIL_DELAY));
    }
  }

  const jobs = allJobs.map((raw) => {
    const hasDetail = Boolean(raw._detail);
    const detail = raw._detail || {};
    const existing = existingById.get(jobIdOf(raw));
    const salary = parseSalaryRange(detail.totalCompensation);

    // Detail-derived fields: undefined = keep stored values for cached jobs
    // (batchUpsert strips them from $set).
    const keep = (value) => (hasDetail || !existing ? (value ?? null) : undefined);

    return {
      jobId: jobIdOf(raw),
      businessTitle: raw.title || detail.title || null,
      agency: raw.dataSource === 'PAGNY' ? 'NYC H+H / PAGNY' : 'NYC Health + Hospitals',
      workLocation: raw.facilityName || detail.facilityName || null,
      workLocation1: raw.boroughName || detail.boroughName || null,
      divisionWorkUnit: raw.departmentName || detail.departmentName || null,
      jobDescription: keep(detail.description),
      minimumQualRequirements: keep(detail.qualifications),
      jobCategory: raw.jobCategoryName || detail.jobCategoryName || null,
      salaryRangeFrom: keep(detail.minSalary || salary.from),
      salaryRangeTo: keep(detail.maxSalary || salary.to),
      salaryFrequency: keep((detail.minSalary || salary.from) ? 'Annual' : null),
      fullTimePartTimeIndicator: raw.jobTypeName || detail.jobTypeName || null,
      postDate: safeDate(raw.modifiedDate),
      externalUrl: hasDetail || !existing
        ? (detail.jobApplyUrl || `https://providercareers.nychealthandhospitals.org/search/${raw.id}`)
        : undefined,
      _lat: raw.latitude ? parseFloat(raw.latitude) : null,
      _lng: raw.longitude ? parseFloat(raw.longitude) : null,
    };
  });

  return batchUpsert(jobs, 'nychhc', timestamp, 'NYC H+H');
};

module.exports = refreshNychhcJobs;
