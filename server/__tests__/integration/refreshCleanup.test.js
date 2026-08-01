const mongoose = require('mongoose');
const { setupDB } = require('../setup');
const Job = require('../../models/Job');
const { cleanupStaleJobs } = require('../../scripts/refreshJobs');
const { JOB_SOURCES } = require('../../../shared/constants');

setupDB();

// Insert a job directly, bypassing scraper pipelines
const seedJob = (overrides = {}) =>
  Job.create({
    jobId: overrides.jobId || `J${Math.random().toString(36).slice(2, 10)}`,
    source: 'nyc',
    businessTitle: 'Test Job',
    savedBy: [],
    ...overrides,
  });

describe('cleanupStaleJobs', () => {
  const now = () => new Date();
  const earlier = () => new Date(Date.now() - 60 * 60 * 1000);

  it('purges stale jobs from a source whose fetch count clears the threshold', async () => {
    const ts = now();
    // 120 fresh nyc jobs (above nyc threshold of 100) + 2 stale ones
    await Promise.all(
      Array.from({ length: 120 }, (_, i) =>
        seedJob({ jobId: `fresh-${i}`, lastRefreshedAt: ts })
      )
    );
    await seedJob({ jobId: 'stale-1', lastRefreshedAt: earlier() });
    await seedJob({ jobId: 'stale-2', lastRefreshedAt: earlier() });

    const deleted = await cleanupStaleJobs(ts, { nyc: 120 });

    expect(deleted).toBe(2);
    expect(await Job.countDocuments({ source: 'nyc' })).toBe(120);
    expect(await Job.exists({ jobId: 'stale-1' })).toBeNull();
  });

  it('never purges jobs a user has saved', async () => {
    const ts = now();
    await Promise.all(
      Array.from({ length: 120 }, (_, i) =>
        seedJob({ jobId: `fresh-${i}`, lastRefreshedAt: ts })
      )
    );
    const userId = new mongoose.Types.ObjectId();
    await seedJob({
      jobId: 'stale-but-saved',
      lastRefreshedAt: earlier(),
      savedBy: [{ user: userId, applicationStatus: 'interested', savedAt: earlier() }],
    });

    const deleted = await cleanupStaleJobs(ts, { nyc: 120 });

    expect(deleted).toBe(0);
    expect(await Job.exists({ jobId: 'stale-but-saved' })).not.toBeNull();
  });

  it('skips cleanup entirely when no source clears its threshold', async () => {
    const ts = now();
    await seedJob({ jobId: 'stale-1', lastRefreshedAt: earlier() });

    // nyc threshold is 100; a run that fetched only 5 jobs must not purge
    const deleted = await cleanupStaleJobs(ts, { nyc: 5 });

    expect(deleted).toBe(0);
    expect(await Job.exists({ jobId: 'stale-1' })).not.toBeNull();
  });

  it('skips purging a source whose fetch looks partial (fetched < 50% of stored)', async () => {
    const ts = now();
    // 300 stored nyc jobs; this run only refreshed 120 of them (>threshold but <50%)
    await Promise.all(
      Array.from({ length: 120 }, (_, i) =>
        seedJob({ jobId: `fresh-${i}`, lastRefreshedAt: ts })
      )
    );
    await Promise.all(
      Array.from({ length: 180 }, (_, i) =>
        seedJob({ jobId: `unrefreshed-${i}`, lastRefreshedAt: earlier() })
      )
    );

    const deleted = await cleanupStaleJobs(ts, { nyc: 120 });

    // Partial-fetch guard: nothing purged even though 120 > threshold 100
    expect(deleted).toBe(0);
    expect(await Job.countDocuments({ source: 'nyc' })).toBe(300);
  });

  it('purges small sources at their lowered thresholds', async () => {
    const ts = now();
    // Frick normally has 2-3 postings; threshold is now 1
    await seedJob({ jobId: 'frick-live', source: 'frick', lastRefreshedAt: ts });
    await seedJob({ jobId: 'frick-filled', source: 'frick', lastRefreshedAt: earlier() });

    const deleted = await cleanupStaleJobs(ts, { frick: 1 });

    expect(deleted).toBe(1);
    expect(await Job.exists({ jobId: 'frick-filled' })).toBeNull();
    expect(await Job.exists({ jobId: 'frick-live' })).not.toBeNull();
  });

  it('always removes jobs whose source is not registered in JOB_SOURCES', async () => {
    const ts = now();
    await Promise.all(
      Array.from({ length: 120 }, (_, i) =>
        seedJob({ jobId: `fresh-${i}`, lastRefreshedAt: ts })
      )
    );
    // Bypass schema enum validation the way bulkWrite does
    await Job.collection.insertOne({
      jobId: 'legacy-1',
      source: 'defunct-source',
      businessTitle: 'Legacy Job',
      savedBy: [],
      lastRefreshedAt: ts,
    });

    const deleted = await cleanupStaleJobs(ts, { nyc: 120 });

    expect(deleted).toBe(1);
    expect(await Job.collection.findOne({ jobId: 'legacy-1' })).toBeNull();
  });

  it('mta is a registered source and its jobs survive cleanup', async () => {
    const ts = now();
    expect(JOB_SOURCES).toContain('mta');
    await Promise.all(
      Array.from({ length: 120 }, (_, i) =>
        seedJob({ jobId: `fresh-${i}`, lastRefreshedAt: ts })
      )
    );
    await seedJob({ jobId: 'mta-1', source: 'mta', lastRefreshedAt: ts });

    await cleanupStaleJobs(ts, { nyc: 120 });

    expect(await Job.exists({ jobId: 'mta-1' })).not.toBeNull();
  });
});
