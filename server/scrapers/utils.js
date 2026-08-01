/**
 * Shared scraper utilities — salary parsing, upsert helpers, etc.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const Job = require('../models/Job');
const { geocodeLocationBase } = require('../helpers/geocoding');

const UPSERT_BATCH = 500;

// Shared salary parsing — handles "$X to $Y", "USD $X to USD $Y", "$X - $Y", "$X/annual - $Y/annual"
const SALARY_REGEX = /(?:USD\s*)?\$\s*([\d,]+(?:\.\d+)?)(?:\s*\/\w+)?(?:\s*[-–]\s*|\s+to\s+)(?:USD\s*)?\$\s*([\d,]+(?:\.\d+)?)/i;
const parseSalaryRange = (text) => {
  if (!text) return { from: null, to: null, frequency: null };
  const match = text.match(SALARY_REGEX);
  if (!match) return { from: null, to: null, frequency: null };
  const from = parseFloat(match[1].replace(/,/g, ''));
  const to = parseFloat(match[2].replace(/,/g, ''));
  const nearby = text.substring(Math.max(0, match.index - 20), match.index + match[0].length + 30);
  const frequency = /hourly|per hour|\/hr/i.test(nearby) ? 'Hourly' : /annual|yearly|per year|\/yr/i.test(nearby) ? 'Annual' : (from >= 1000 ? 'Annual' : 'Hourly');
  return { from, to, frequency };
};

// Strip undefined values from a $set object. Scrapers set a field to undefined to
// mean "leave whatever the DB already has" (e.g. detail-page fields for jobs whose
// detail wasn't refetched this run) — without this, cached refreshes null them out.
const omitUndefined = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
};

// Parse a date-ish value; returns a valid Date or null. Prevents Invalid Date
// objects from aborting whole bulkWrite batches at Mongoose cast time.
const safeDate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Shared upsert helper — builds bulkWrite ops for a batch of jobs
const buildUpsertOps = (jobs, source, timestamp) =>
  jobs.map((job) => {
    const coords = (job._lat && job._lng)
      ? { lat: job._lat, lng: job._lng }
      : geocodeLocationBase(job.workLocation, job.workLocation1, source);
    const { _lat, _lng, ...jobData } = job;
    return {
      updateOne: {
        filter: { jobId: jobData.jobId, source },
        update: {
          $set: { ...jobData, source, coordinates: coords || { lat: null, lng: null }, lastRefreshedAt: timestamp },
          $setOnInsert: { savedBy: [] },
        },
        upsert: true,
      },
    };
  });

// Shared batch upsert — runs bulkWrite in batches
const batchUpsert = async (jobs, source, timestamp) => {
  let totalUpserted = 0;
  let totalModified = 0;
  for (let i = 0; i < jobs.length; i += UPSERT_BATCH) {
    const ops = buildUpsertOps(jobs.slice(i, i + UPSERT_BATCH), source, timestamp);
    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }
  return { upserted: totalUpserted, modified: totalModified };
};

module.exports = {
  axios,
  cheerio,
  Job,
  geocodeLocationBase,
  UPSERT_BATCH,
  parseSalaryRange,
  omitUndefined,
  safeDate,
  buildUpsertOps,
  batchUpsert,
};
