const { setupDB } = require('../setup');
const Job = require('../../models/Job');
const { backfillAnnualSalary } = require('../../scripts/backfillAnnualSalary');

setupDB();

// Jobs written before the annual columns existed have them unset, and salary
// filtering now reads those columns — so until this runs (or the source next
// refreshes) those jobs drop out of salary-filtered results entirely.
// insertMany with validateBeforeSave:false reproduces that pre-migration state,
// since the schema hook would otherwise fill the columns in.
const insertLegacy = (docs) =>
  Job.collection.insertMany(
    docs.map((d) => ({
      source: 'nyc',
      savedBy: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...d,
    }))
  );

describe('backfillAnnualSalary', () => {
  it('fills the annual columns for jobs that predate them', async () => {
    await insertLegacy([
      { jobId: 'L1', businessTitle: 'Hourly Role', salaryRangeFrom: 95, salaryRangeTo: 120, salaryFrequency: 'Hourly' },
      { jobId: 'L2', businessTitle: 'Annual Role', salaryRangeFrom: 90000, salaryRangeTo: 110000, salaryFrequency: 'Annual' },
    ]);

    const result = await backfillAnnualSalary();
    expect(result.updated).toBe(2);

    const hourly = await Job.findOne({ jobId: 'L1' }).lean();
    expect(hourly.annualSalaryFrom).toBe(197600);
    expect(hourly.annualSalaryTo).toBe(249600);
    // The advertised figures are untouched
    expect(hourly.salaryRangeFrom).toBe(95);

    const annual = await Job.findOne({ jobId: 'L2' }).lean();
    expect(annual.annualSalaryFrom).toBe(90000);
  });

  it('canonicalises a frequency spelling while it is there', async () => {
    await insertLegacy([
      { jobId: 'L3', businessTitle: 'Feed Spelling', salaryRangeFrom: 17, salaryRangeTo: 17, salaryFrequency: 'hour' },
    ]);

    await backfillAnnualSalary();

    const job = await Job.findOne({ jobId: 'L3' }).lean();
    expect(job.salaryFrequency).toBe('Hourly');
    expect(job.annualSalaryFrom).toBe(35360);
  });

  it('leaves jobs with no salary alone', async () => {
    await insertLegacy([{ jobId: 'L4', businessTitle: 'No Salary' }]);

    const result = await backfillAnnualSalary();
    expect(result.scanned).toBe(0);

    const job = await Job.findOne({ jobId: 'L4' }).lean();
    expect(job.annualSalaryFrom).toBeUndefined();
  });

  it('is idempotent — a second run has nothing left to do', async () => {
    await insertLegacy([
      { jobId: 'L5', businessTitle: 'Role', salaryRangeFrom: 50, salaryFrequency: 'Hourly' },
    ]);

    expect((await backfillAnnualSalary()).updated).toBe(1);
    expect((await backfillAnnualSalary()).scanned).toBe(0);
  });

  it('reports without writing on a dry run', async () => {
    await insertLegacy([
      { jobId: 'L6', businessTitle: 'Role', salaryRangeFrom: 60000, salaryFrequency: 'Annual' },
    ]);

    const result = await backfillAnnualSalary({ dryRun: true });
    expect(result.scanned).toBe(1);
    expect(result.updated).toBe(0);

    const job = await Job.findOne({ jobId: 'L6' }).lean();
    expect(job.annualSalaryFrom).toBeUndefined();
  });

  it('walks past the batch size without skipping documents', async () => {
    // Paginating with skip would step over unprocessed jobs, because the
    // filter stops matching each document as it is updated.
    const many = Array.from({ length: 1200 }, (_, i) => ({
      jobId: `BULK-${i}`,
      businessTitle: `Role ${i}`,
      salaryRangeFrom: 40,
      salaryFrequency: 'Hourly',
    }));
    await insertLegacy(many);

    expect((await backfillAnnualSalary()).updated).toBe(1200);
    expect(await Job.countDocuments({ annualSalaryFrom: null, salaryRangeFrom: { $ne: null } })).toBe(0);
  });
});
