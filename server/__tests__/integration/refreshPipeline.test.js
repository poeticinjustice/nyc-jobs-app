const { setupDB } = require('../setup');
const Job = require('../../models/Job');
const ScraperRun = require('../../models/ScraperRun');
const SavedSearch = require('../../models/SavedSearch');
const { refreshAllJobs } = require('../../scripts/refreshJobs');
const { createTestUser } = require('../helpers/testHelpers');

setupDB();

// A fake scraper that writes jobs the way the real ones do
const fakeScraper = (source, count, { fail = false } = {}) => async (timestamp) => {
  if (fail) throw new Error('simulated source outage');
  if (count === 0) return { upserted: 0, modified: 0 };

  const ops = Array.from({ length: count }, (_, i) => ({
    updateOne: {
      filter: { jobId: `${source}-${i}`, source },
      update: {
        $set: {
          jobId: `${source}-${i}`,
          source,
          businessTitle: `${source} role ${i}`,
          agency: `${source} agency`,
          lastRefreshedAt: timestamp,
        },
        $setOnInsert: { savedBy: [] },
      },
      upsert: true,
    },
  }));
  const result = await Job.bulkWrite(ops, { ordered: false });
  return { upserted: result.upsertedCount, modified: result.modifiedCount };
};

describe('refreshAllJobs pipeline', () => {
  it('records a ScraperRun per source with timing and counts', async () => {
    await refreshAllJobs({
      scrapers: [
        { source: 'nyc', fn: fakeScraper('nyc', 3) },
        { source: 'nypl', fn: fakeScraper('nypl', 2) },
      ],
    });

    const runs = await ScraperRun.find({}).sort({ source: 1 }).lean();
    expect(runs).toHaveLength(2);

    const nyc = runs.find((r) => r.source === 'nyc');
    expect(nyc.upserted).toBe(3);
    expect(nyc.status).toBe('ok');
    expect(nyc.storedAfter).toBe(3);
    expect(nyc.durationMs).toBeGreaterThanOrEqual(0);
    expect(nyc.finishedAt).toBeTruthy();
    // Every source in one cycle shares a runId
    expect(new Set(runs.map((r) => r.runId)).size).toBe(1);
  });

  it('records a failed scraper without aborting the others', async () => {
    await refreshAllJobs({
      scrapers: [
        { source: 'nyc', fn: fakeScraper('nyc', 2) },
        { source: 'cuny', fn: fakeScraper('cuny', 1, { fail: true }) },
      ],
    });

    const cuny = await ScraperRun.findOne({ source: 'cuny' }).lean();
    expect(cuny.status).toBe('failed');
    expect(cuny.error).toMatch(/simulated source outage/);

    // The healthy source still ran and stored its jobs
    expect(await Job.countDocuments({ source: 'nyc' })).toBe(2);
  });

  it('marks a source that returned nothing as empty', async () => {
    await refreshAllJobs({ scrapers: [{ source: 'frick', fn: fakeScraper('frick', 0) }] });

    const frick = await ScraperRun.findOne({ source: 'frick' }).lean();
    expect(frick.status).toBe('empty');
  });

  it('flags a run that refreshed far less than what is stored as partial', async () => {
    // Seed 20 stored jobs, then run a scraper that only refreshes 5 of them
    await refreshAllJobs({ scrapers: [{ source: 'nyc', fn: fakeScraper('nyc', 20) }] });
    await ScraperRun.deleteMany({});

    await refreshAllJobs({ scrapers: [{ source: 'nyc', fn: fakeScraper('nyc', 5) }] });

    const run = await ScraperRun.findOne({ source: 'nyc' }).lean();
    expect(run.status).toBe('partial');
    // And the partial-fetch guard must have refused to purge the other 15
    expect(await Job.countDocuments({ source: 'nyc' })).toBe(20);
  });

  it('runs saved-search alerts as part of the cycle', async () => {
    const { user } = await createTestUser();
    const search = await SavedSearch.create({
      user: user._id,
      name: 'Everything',
      criteria: { q: '', source: 'all' },
      alertsEnabled: true,
      lastNotifiedAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    await refreshAllJobs({ scrapers: [{ source: 'nyc', fn: fakeScraper('nyc', 3) }] });

    // The alert pass ran and moved the notification marker forward
    const after = await SavedSearch.findById(search._id).lean();
    expect(after.lastNotifiedAt.getTime()).toBeGreaterThan(search.lastNotifiedAt.getTime());
  });
});
