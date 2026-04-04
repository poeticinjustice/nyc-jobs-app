/**
 * New York Public Library Jobs (Pinpoint ATS — public JSON endpoint)
 */

const { axios, Job, geocodeLocationBase, UPSERT_BATCH, parseSalaryRange } = require('./utils');

const NYPL_POSTINGS_URL = 'https://nypl.pinpointhq.com/postings.json';

const refreshNyplJobs = async (timestamp) => {
  console.log('[refresh] Fetching NYPL jobs...');

  let allJobs = [];

  try {
    const { data } = await axios.get(NYPL_POSTINGS_URL, { timeout: 30000 });
    allJobs = data?.data || [];
    console.log(`[refresh] NYPL: ${allJobs.length} total jobs`);
  } catch (err) {
    console.warn('[refresh] NYPL fetch error:', err.message);
    return { upserted: 0, modified: 0 };
  }

  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < allJobs.length; i += UPSERT_BATCH) {
    const slice = allJobs.slice(i, i + UPSERT_BATCH);
    const ops = slice.map((raw) => {
      const salary = parseSalaryRange(raw.compensation);

      const job = {
        jobId: raw.id,
        businessTitle: raw.title || null,
        agency: 'New York Public Library',
        workLocation: raw.location?.name || null,
        workLocation1: typeof raw.job?.structure_custom_group_one === 'string' ? raw.job.structure_custom_group_one : null,
        jobDescription: raw.description || null,
        minimumQualRequirements: raw.key_responsibilities || null,
        jobCategory: raw.job?.department?.name || null,
        salaryRangeFrom: raw.compensation_minimum || salary.from,
        salaryRangeTo: raw.compensation_maximum || salary.to,
        salaryFrequency: (raw.compensation_minimum || salary.from) ? (raw.compensation_frequency === 'yearly' ? 'Annual' : raw.compensation_frequency === 'hourly' ? 'Hourly' : salary.frequency || 'Annual') : null,
        fullTimePartTimeIndicator: raw.employment_type_text || null,
        postDate: raw.published_at || null,
        externalUrl: raw.url || `https://nypl.pinpointhq.com/en/postings/${raw.id}`,
      };

      const coords = geocodeLocationBase(job.workLocation, job.workLocation1, 'nypl');

      return {
        updateOne: {
          filter: { jobId: job.jobId, source: 'nypl' },
          update: {
            $set: { ...job, source: 'nypl', coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
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

  console.log(`[refresh] NYPL: ${totalUpserted} inserted, ${totalModified} updated`);
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = refreshNyplJobs;
