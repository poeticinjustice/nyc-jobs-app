/**
 * One-off backfill for annualSalaryFrom/annualSalaryTo.
 *
 * These columns were added after the collection was already populated. New and
 * refreshed jobs get them from deriveAnnualSalary, but every job written before
 * the change has them unset — and salary filtering and sorting now read them,
 * so those jobs would silently drop out of salary-filtered results until their
 * source next refreshes them.
 *
 * A full refresh cycle repopulates everything within six hours, so this exists
 * to close the gap immediately after deploying rather than waiting.
 *
 * Usage:
 *   node server/scripts/backfillAnnualSalary.js          # apply
 *   node server/scripts/backfillAnnualSalary.js --dry    # report only
 */

const mongoose = require('mongoose');
const Job = require('../models/Job');
const { deriveAnnualSalary } = require('../helpers/salary');

const BATCH = 1000;

const backfillAnnualSalary = async ({ dryRun = false } = {}) => {
  // Only jobs that have a salary but no annual equivalent yet.
  const filter = {
    $and: [
      { $or: [{ salaryRangeFrom: { $ne: null } }, { salaryRangeTo: { $ne: null } }] },
      { $or: [{ annualSalaryFrom: null }, { annualSalaryFrom: { $exists: false } }] },
    ],
  };

  const total = await Job.countDocuments(filter);
  console.log(`[backfill] ${total} job(s) need annual salary columns`);
  if (total === 0 || dryRun) {
    if (dryRun) console.log('[backfill] dry run — nothing written');
    return { scanned: total, updated: 0 };
  }

  let updated = 0;
  let lastId = null;

  for (;;) {
    // Paginate by _id rather than skip: the filter stops matching as documents
    // are updated, so a skipping cursor would step over unprocessed jobs.
    const page = await Job.find(lastId ? { ...filter, _id: { $gt: lastId } } : filter)
      .select('salaryRangeFrom salaryRangeTo salaryFrequency')
      .sort({ _id: 1 })
      .limit(BATCH)
      .lean();

    if (page.length === 0) break;
    lastId = page[page.length - 1]._id;

    const ops = page.map((job) => {
      const derived = deriveAnnualSalary({ ...job });
      return {
        updateOne: {
          filter: { _id: job._id },
          update: {
            $set: {
              salaryFrequency: derived.salaryFrequency ?? null,
              annualSalaryFrom: derived.annualSalaryFrom,
              annualSalaryTo: derived.annualSalaryTo,
            },
          },
        },
      };
    });

    const result = await Job.bulkWrite(ops, { ordered: false });
    updated += result.modifiedCount;
    console.log(`[backfill] ${updated}/${total}`);
  }

  console.log(`[backfill] done — ${updated} job(s) updated`);
  return { scanned: total, updated };
};

if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const dryRun = process.argv.includes('--dry');

  (async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB');
      await backfillAnnualSalary({ dryRun });
    } catch (err) {
      console.error('Backfill failed:', err);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })();
}

module.exports = { backfillAnnualSalary };
