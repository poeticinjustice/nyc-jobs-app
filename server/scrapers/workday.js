/**
 * Workday platform scraper — shared by Met Museum, NYP, New School, etc.
 */

const { axios, Job, geocodeLocationBase, UPSERT_BATCH, parseSalaryRange } = require('./utils');

const WORKDAY_PAGE_SIZE = 20;
const WORKDAY_DETAIL_CONCURRENCY = 5;
const WORKDAY_DETAIL_DELAY = 200;

const fetchWorkdayDetail = async (baseUrl, externalPath) => {
  try {
    const { data } = await axios.get(`${baseUrl}${externalPath}`, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    const info = data.jobPostingInfo || {};
    return {
      description: info.jobDescription || null,
      timeType: info.timeType || null,
      startDate: info.startDate || null,
      endDate: info.endDate || null,
    };
  } catch {
    return null;
  }
};

const refreshWorkdayJobs = async (timestamp, config) => {
  const { name, apiUrl, detailBaseUrl, publicBaseUrl, source, agency } = config;
  console.log(`[refresh] Fetching ${name} jobs...`);

  let allJobs = [];
  let offset = 0;
  let total = 0;

  try {
    while (true) {
      const { data } = await axios.post(apiUrl, {
        appliedFacets: {},
        limit: WORKDAY_PAGE_SIZE,
        offset,
        searchText: '',
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

      if (offset === 0) {
        total = data.total || 0;
        console.log(`[refresh] ${name}: ${total} total jobs`);
      }

      const postings = data.jobPostings || [];
      if (postings.length === 0) break;
      allJobs.push(...postings);
      offset += WORKDAY_PAGE_SIZE;
      if (offset >= total) break;
    }
  } catch (err) {
    console.warn(`[refresh] ${name} fetch error (partial data may be used):`, err.message);
  }

  console.log(`[refresh] Fetched ${allJobs.length} ${name} jobs`);
  if (allJobs.length === 0) return { upserted: 0, modified: 0 };

  // Fetch detail pages for jobs missing descriptions
  const existingJobs = await Job.find(
    { source, jobId: { $in: allJobs.map((j) => j.bulletFields?.[0] || j.externalPath) } },
    { jobId: 1, jobDescription: 1 }
  ).lean();
  const hasDesc = new Set(existingJobs.filter((j) => j.jobDescription).map((j) => j.jobId));

  const needsDetail = allJobs.filter((j) => {
    const reqId = j.bulletFields?.[0] || j.externalPath;
    return !hasDesc.has(reqId) && j.externalPath;
  });

  console.log(`[refresh] ${name}: fetching ${needsDetail.length} detail pages (${allJobs.length - needsDetail.length} cached)`);

  const detailMap = new Map();
  for (let i = 0; i < needsDetail.length; i += WORKDAY_DETAIL_CONCURRENCY) {
    const batch = needsDetail.slice(i, i + WORKDAY_DETAIL_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((j) => fetchWorkdayDetail(detailBaseUrl, j.externalPath))
    );
    for (let k = 0; k < results.length; k++) {
      if (results[k].status === 'fulfilled' && results[k].value) {
        const reqId = batch[k].bulletFields?.[0] || batch[k].externalPath;
        detailMap.set(reqId, results[k].value);
      }
    }
    if (i + WORKDAY_DETAIL_CONCURRENCY < needsDetail.length) {
      await new Promise((r) => setTimeout(r, WORKDAY_DETAIL_DELAY));
    }
    if ((i + WORKDAY_DETAIL_CONCURRENCY) % 50 === 0) {
      console.log(`[refresh] ${name} detail pages: ${i + WORKDAY_DETAIL_CONCURRENCY}/${needsDetail.length}`);
    }
  }

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const reqId = raw.bulletFields?.[0] || raw.externalPath?.match(/_([\w]+)$/)?.[1] || raw.externalPath;
      const detail = detailMap.get(reqId);
      const existing = existingJobs.find((j) => j.jobId === reqId);

      // Parse salary from detail description
      const desc = detail?.description || existing?.jobDescription || null;
      const { from: salaryFrom, to: salaryTo, frequency: salaryFrequency } = parseSalaryRange(desc || '');

      const job = {
        jobId: reqId,
        businessTitle: raw.title || null,
        agency,
        workLocation: raw.locationsText || 'New York',
        workLocation1: raw.locationsText || null,
        jobDescription: desc,
        jobCategory: null,
        salaryRangeFrom: salaryFrom,
        salaryRangeTo: salaryTo,
        salaryFrequency: salaryFrequency,
        fullTimePartTimeIndicator: detail?.timeType || null,
        postDate: raw.postedOn && !raw.postedOn.startsWith('Posted') ? new Date(raw.postedOn) : (detail?.startDate || null),
        postUntil: detail?.endDate || null,
        externalUrl: raw.externalPath ? `${publicBaseUrl}${raw.externalPath}` : null,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, source);
      return {
        updateOne: {
          filter: { jobId: job.jobId, source },
          update: {
            $set: { ...job, source, coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
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

  console.log(`[refresh] ${name}: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshWorkdayJobs;
