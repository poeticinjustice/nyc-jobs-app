/**
 * Shared scraper utilities — salary parsing, upsert helpers, etc.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const Job = require('../models/Job');
const { geocodeLocationBase } = require('../helpers/geocoding');
const { deriveAnnualSalary } = require('../helpers/salary');

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

/**
 * Resolve the coordinates for one job document.
 *
 * Precedence:
 *  1. `_coords` — an explicit value from the scraper. May be `undefined`, which
 *     means "leave whatever is stored"; omitUndefined then drops the field.
 *  2. `_lat`/`_lng` — coordinates the feed itself supplied.
 *  3. Geocoding from the work location.
 *
 * A scraper that leaves `workLocation` undefined for cached jobs must pass
 * `_coords: undefined` too — otherwise geocoding an undefined location writes a
 * null coordinate over a good stored one.
 */
const resolveCoords = (job, source) => {
  if (Object.prototype.hasOwnProperty.call(job, '_coords')) return job._coords;
  if (job._lat && job._lng) return { lat: job._lat, lng: job._lng };
  return geocodeLocationBase(job.workLocation, job.workLocation1, source) || { lat: null, lng: null };
};

/**
 * Build the bulkWrite ops for a batch of jobs. Every scraper goes through here,
 * so the upsert shape — filter, omitUndefined, savedBy seeding — is defined once.
 *
 * Fields prefixed with `_` are directives to this helper, not document fields:
 *   _coords        explicit coordinates (see resolveCoords)
 *   _lat / _lng    coordinates from the feed
 *   _setOnInsert   extra $setOnInsert fields, e.g. { postDate: timestamp } for a
 *                  source that publishes no posted date
 */
const DIRECTIVES = new Set(['_lat', '_lng', '_coords', '_setOnInsert']);

const buildUpsertOps = (jobs, source, timestamp) =>
  jobs.map((job) => {
    const coords = resolveCoords(job, source);
    const { _lat, _lng, _coords, _setOnInsert, ...jobData } = job;

    // Every scraper routes through here, so annualising once covers all 25
    // sources — filtering and sorting compare annual figures while the raw
    // columns keep the unit the posting was advertised in. Only computed when
    // the scraper is actually writing a salary this run: leaving them undefined
    // lets omitUndefined preserve what is stored for a cached job.
    if (jobData.salaryRangeFrom !== undefined || jobData.salaryRangeTo !== undefined) {
      deriveAnnualSalary(jobData);
    }

    // A misspelt directive would otherwise fall through to jobData and be
    // stored as a document field — silently doing nothing while the scraper
    // looks correct. Fail loudly at build time instead.
    const unknown = Object.keys(jobData).filter((k) => k.startsWith('_'));
    if (unknown.length > 0) {
      throw new Error(
        `${source}: unknown upsert directive(s) ${unknown.join(', ')} — expected one of ${[...DIRECTIVES].join(', ')}`
      );
    }

    return {
      updateOne: {
        filter: { jobId: jobData.jobId, source },
        update: {
          $set: omitUndefined({ ...jobData, source, coordinates: coords, lastRefreshedAt: timestamp }),
          $setOnInsert: { savedBy: [], ..._setOnInsert },
        },
        upsert: true,
      },
    };
  });

/**
 * Upsert a source's jobs in batches and report what changed.
 *
 * Jobs without a jobId are dropped: the upsert filter would be
 * `{ jobId: undefined, source }`, which MongoDB reads as "jobId is null or
 * missing" and would let one malformed feed entry overwrite an unrelated doc.
 */
const batchUpsert = async (jobs, source, timestamp, label = source) => {
  const usable = jobs.filter((j) => j.jobId !== undefined && j.jobId !== null && j.jobId !== '');
  const skipped = jobs.length - usable.length;
  if (skipped > 0) {
    console.warn(`[refresh] ${label}: skipped ${skipped} job(s) with no id`);
  }

  let totalUpserted = 0;
  let totalModified = 0;
  for (let i = 0; i < usable.length; i += UPSERT_BATCH) {
    const ops = buildUpsertOps(usable.slice(i, i + UPSERT_BATCH), source, timestamp);
    const result = await Job.bulkWrite(ops, { ordered: false });
    totalUpserted += result.upsertedCount;
    totalModified += result.modifiedCount;
  }

  console.log(`[refresh] ${label}: ${totalUpserted} inserted, ${totalModified} updated`);
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
