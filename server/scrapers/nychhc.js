/**
 * NYC Health + Hospitals — Provider/Clinical Jobs (custom REST API)
 *
 * Covers physician, NP, allied health, and clinical roles posted on
 * providercareers.nychealthandhospitals.org.  The non-provider (admin/nursing)
 * careers sit behind a PeopleSoft login wall and are not scrapable.
 */

const { axios, Job, geocodeLocationBase, UPSERT_BATCH, parseSalaryRange } = require('./utils');

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

  // Fetch details in batches for full descriptions
  const DETAIL_CONCURRENCY = 5;
  const DETAIL_DELAY = 200;
  for (let i = 0; i < allJobs.length; i += DETAIL_CONCURRENCY) {
    const batch = allJobs.slice(i, i + DETAIL_CONCURRENCY);
    const details = await Promise.all(batch.map((j) => fetchJobDetail(j.id)));
    details.forEach((detail, idx) => {
      if (detail) allJobs[i + idx]._detail = detail;
    });
    if (i + DETAIL_CONCURRENCY < allJobs.length) {
      await new Promise((r) => setTimeout(r, DETAIL_DELAY));
    }
  }

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const detail = raw._detail || {};
      const salary = parseSalaryRange(detail.totalCompensation);

      const job = {
        jobId: raw.jobId?.toString() || raw.id,
        businessTitle: raw.title || detail.title || null,
        agency: raw.dataSource === 'PAGNY' ? 'NYC H+H / PAGNY' : 'NYC Health + Hospitals',
        workLocation: raw.facilityName || detail.facilityName || null,
        workLocation1: raw.boroughName || detail.boroughName || null,
        divisionWorkUnit: raw.departmentName || detail.departmentName || null,
        jobDescription: detail.description || null,
        minimumQualRequirements: detail.qualifications || null,
        jobCategory: raw.jobCategoryName || detail.jobCategoryName || null,
        salaryRangeFrom: detail.minSalary || salary.from,
        salaryRangeTo: detail.maxSalary || salary.to,
        salaryFrequency: (detail.minSalary || salary.from) ? 'Annual' : null,
        fullTimePartTimeIndicator: raw.jobTypeName || detail.jobTypeName || null,
        postDate: raw.modifiedDate || null,
        externalUrl: detail.jobApplyUrl || `https://providercareers.nychealthandhospitals.org/search/${raw.id}`,
      };

      const lat = raw.latitude ? parseFloat(raw.latitude) : null;
      const lng = raw.longitude ? parseFloat(raw.longitude) : null;
      const coords = (lat && lng) ? { lat, lng } : geocodeLocationBase(job.workLocation, job.workLocation1, 'nychhc');

      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'nychhc' },
          update: {
            $set: { ...job, source: 'nychhc', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
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

  console.log(`[refresh] NYC H+H: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshNychhcJobs;
