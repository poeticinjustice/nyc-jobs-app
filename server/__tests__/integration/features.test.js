const request = require('supertest');
const { setupDB } = require('../setup');
const app = require('../../app');
const Job = require('../../models/Job');
const User = require('../../models/User');
const SavedSearch = require('../../models/SavedSearch');
const ScraperRun = require('../../models/ScraperRun');
const {
  createTestUser,
  createAdminUser,
  createTestJob,
  createSavedJob,
  authHeader,
} = require('../helpers/testHelpers');

setupDB();

describe('Search CSV export', () => {
  it('returns CSV with a header row and matching jobs', async () => {
    await createTestJob({ businessTitle: 'Bridge Engineer', agency: 'DOT' });
    await createTestJob({ businessTitle: 'Park Ranger', agency: 'Parks' });

    const res = await request(app).get('/api/jobs/search/export');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/job-search-results\.csv/);

    const lines = res.text.trim().split('\n');
    expect(lines[0]).toContain('Job ID');
    expect(lines[0]).toContain('URL');
    expect(lines).toHaveLength(3); // header + 2 jobs
  });

  it('honours the same filters as the search endpoint', async () => {
    await createTestJob({ businessTitle: 'Bridge Engineer', agency: 'DOT' });
    await createTestJob({ businessTitle: 'Park Ranger', agency: 'Parks' });

    const res = await request(app).get('/api/jobs/search/export?q=bridge');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Bridge Engineer');
    expect(res.text).not.toContain('Park Ranger');
  });

  it('rejects an invalid source filter', async () => {
    const res = await request(app).get('/api/jobs/search/export?source=notasource');
    expect(res.status).toBe(400);
  });
});

describe('New-since-last-seen badges', () => {
  it('flags jobs created after the user last marked jobs seen', async () => {
    const { user, token } = await createTestUser();
    // Move the marker back so anything created now counts as new
    await User.updateOne(
      { _id: user._id },
      { $set: { lastJobsSeenAt: new Date(Date.now() - 60 * 60 * 1000) } }
    );
    await createTestJob({ businessTitle: 'Brand New Role' });

    const res = await request(app)
      .get('/api/jobs/search')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.jobs[0].isNew).toBe(true);
    expect(res.body.newSinceLastSeen).toBe(1);
  });

  it('POST /api/jobs/seen advances the marker so nothing is new afterwards', async () => {
    const { user, token } = await createTestUser();
    await User.updateOne(
      { _id: user._id },
      { $set: { lastJobsSeenAt: new Date(Date.now() - 60 * 60 * 1000) } }
    );
    await createTestJob();

    const seen = await request(app)
      .post('/api/jobs/seen')
      .set('Authorization', authHeader(token));
    expect(seen.status).toBe(200);
    expect(seen.body.lastJobsSeenAt).toBeTruthy();

    const res = await request(app)
      .get('/api/jobs/search')
      .set('Authorization', authHeader(token));
    expect(res.body.newSinceLastSeen).toBe(0);
    expect(res.body.jobs[0].isNew).toBe(false);
  });

  it('does not mark anything new for anonymous visitors', async () => {
    await createTestJob();
    const res = await request(app).get('/api/jobs/search');
    expect(res.status).toBe(200);
    expect(res.body.newSinceLastSeen).toBe(0);
    expect(res.body.jobs[0].isNew).toBeUndefined();
  });

  it('requires authentication to mark jobs seen', async () => {
    const res = await request(app).post('/api/jobs/seen');
    expect(res.status).toBe(401);
  });
});

describe('Bulk application-status updates', () => {
  it('updates every saved job in one call and records history', async () => {
    const { user, token } = await createTestUser();
    const a = await createSavedJob(user._id);
    const b = await createSavedJob(user._id);

    const res = await request(app)
      .put('/api/jobs/saved/bulk-status')
      .set('Authorization', authHeader(token))
      .send({
        status: 'applied',
        jobs: [
          { jobId: a.jobId, source: a.source },
          { jobId: b.jobId, source: b.source },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    const refreshed = await Job.findById(a._id).lean();
    const entry = refreshed.savedBy.find((s) => String(s.user) === String(user._id));
    expect(entry.applicationStatus).toBe('applied');
    expect(entry.statusHistory.at(-1).status).toBe('applied');
  });

  it("does not touch another user's saved jobs", async () => {
    const { user: mine, token } = await createTestUser();
    const { user: theirs } = await createTestUser();
    await createSavedJob(mine._id);
    const theirJob = await createSavedJob(theirs._id);

    const res = await request(app)
      .put('/api/jobs/saved/bulk-status')
      .set('Authorization', authHeader(token))
      .send({
        status: 'rejected',
        jobs: [{ jobId: theirJob.jobId, source: theirJob.source }],
      });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(0);

    const untouched = await Job.findById(theirJob._id).lean();
    expect(untouched.savedBy[0].applicationStatus).toBe('interested');
  });

  it('rejects an invalid status and an empty job list', async () => {
    const { token } = await createTestUser();

    const badStatus = await request(app)
      .put('/api/jobs/saved/bulk-status')
      .set('Authorization', authHeader(token))
      .send({ status: 'nonsense', jobs: [{ jobId: 'x', source: 'nyc' }] });
    expect(badStatus.status).toBe(400);

    const empty = await request(app)
      .put('/api/jobs/saved/bulk-status')
      .set('Authorization', authHeader(token))
      .send({ status: 'applied', jobs: [] });
    expect(empty.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .put('/api/jobs/saved/bulk-status')
      .send({ status: 'applied', jobs: [{ jobId: 'x' }] });
    expect(res.status).toBe(401);
  });
});

describe('Scraper health', () => {
  const seedRun = (overrides = {}) =>
    ScraperRun.create({
      runId: 'run-1',
      source: 'nyc',
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 1200,
      upserted: 100,
      modified: 50,
      storedAfter: 1000,
      status: 'ok',
      ...overrides,
    });

  it('is admin-only', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .get('/api/jobs/admin/scraper-health')
      .set('Authorization', authHeader(token));
    expect([401, 403]).toContain(res.status);
  });

  it('reports the latest run per source and flags failures', async () => {
    const { token } = await createAdminUser();
    await seedRun({ source: 'nyc' });
    await seedRun({ source: 'cuny', status: 'failed', error: 'ECONNRESET', upserted: 0, modified: 0 });

    const res = await request(app)
      .get('/api/jobs/admin/scraper-health')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    const bySource = Object.fromEntries(res.body.sources.map((s) => [s.source, s]));
    expect(bySource.nyc.fetched).toBe(150);
    expect(bySource.nyc.flatlined).toBe(false);
    expect(bySource.cuny.status).toBe('failed');
    expect(bySource.cuny.flatlined).toBe(true);
    expect(bySource.cuny.error).toBe('ECONNRESET');
    expect(res.body.summary.flatlined).toBe(1);
  });

  it('lists sources that have never reported a run', async () => {
    const { token } = await createAdminUser();
    await seedRun({ source: 'nyc' });

    const res = await request(app)
      .get('/api/jobs/admin/scraper-health')
      .set('Authorization', authHeader(token));

    expect(res.body.missing).toContain('frick');
    expect(res.body.missing).not.toContain('nyc');
    expect(res.body.summary.neverRan).toBe(res.body.missing.length);
  });

  it('treats an empty run as flatlined', async () => {
    const { token } = await createAdminUser();
    await seedRun({ source: 'nypl', status: 'empty', upserted: 0, modified: 0 });

    const res = await request(app)
      .get('/api/jobs/admin/scraper-health')
      .set('Authorization', authHeader(token));

    const nypl = res.body.sources.find((s) => s.source === 'nypl');
    expect(nypl.flatlined).toBe(true);
  });
});

describe('Saved-search alerts', () => {
  const makeSearch = (userId, overrides = {}) =>
    SavedSearch.create({
      user: userId,
      name: 'Engineering roles',
      criteria: { q: 'engineer', source: 'all', sort: 'date_desc' },
      lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
      ...overrides,
    });

  it('reports a new-match count for jobs added since the search was last seen', async () => {
    const { user, token } = await createTestUser();
    await makeSearch(user._id);
    await createTestJob({ businessTitle: 'Bridge Engineer' });
    await createTestJob({ businessTitle: 'Librarian' }); // shouldn't match

    const res = await request(app)
      .get('/api/searches')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.searches[0].newCount).toBe(1);
    expect(res.body).toHaveProperty('emailAlertsAvailable');
  });

  it('marking a search seen clears its count', async () => {
    const { user, token } = await createTestUser();
    const search = await makeSearch(user._id);
    await createTestJob({ businessTitle: 'Bridge Engineer' });

    const seen = await request(app)
      .post(`/api/searches/${search._id}/seen`)
      .set('Authorization', authHeader(token));
    expect(seen.status).toBe(200);

    const res = await request(app)
      .get('/api/searches')
      .set('Authorization', authHeader(token));
    expect(res.body.searches[0].newCount).toBe(0);
  });

  it('returns the actual new matches', async () => {
    const { user, token } = await createTestUser();
    const search = await makeSearch(user._id);
    await createTestJob({ businessTitle: 'Bridge Engineer' });

    const res = await request(app)
      .get(`/api/searches/${search._id}/matches`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0].businessTitle).toBe('Bridge Engineer');
  });

  it('toggles alerts on and off', async () => {
    const { user, token } = await createTestUser();
    const search = await makeSearch(user._id);

    const on = await request(app)
      .patch(`/api/searches/${search._id}/alerts`)
      .set('Authorization', authHeader(token))
      .send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.search.alertsEnabled).toBe(true);
    // Enabling starts the clock so the existing backlog isn't emailed
    expect(on.body.search.lastNotifiedAt).toBeTruthy();

    const off = await request(app)
      .patch(`/api/searches/${search._id}/alerts`)
      .set('Authorization', authHeader(token))
      .send({ enabled: false });
    expect(off.body.search.alertsEnabled).toBe(false);
  });

  it("does not expose or mutate another user's saved search", async () => {
    const { user: owner } = await createTestUser();
    const { token: otherToken } = await createTestUser();
    const search = await makeSearch(owner._id);

    const get = await request(app)
      .get(`/api/searches/${search._id}`)
      .set('Authorization', authHeader(otherToken));
    expect(get.status).toBe(404);

    const toggle = await request(app)
      .patch(`/api/searches/${search._id}/alerts`)
      .set('Authorization', authHeader(otherToken))
      .send({ enabled: true });
    expect(toggle.status).toBe(404);

    const unchanged = await SavedSearch.findById(search._id).lean();
    expect(unchanged.alertsEnabled).toBe(false);
  });

  it('hydrates a single saved search for deep links', async () => {
    const { user, token } = await createTestUser();
    const search = await makeSearch(user._id);

    const res = await request(app)
      .get(`/api/searches/${search._id}`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.search.name).toBe('Engineering roles');
    expect(res.body.search.criteria.q).toBe('engineer');
  });
});

describe('Multi-source saved searches', () => {
  it('saves a comma-separated source list (the search endpoint accepts one)', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/searches')
      .set('Authorization', authHeader(token))
      .send({ name: 'Hospitals', criteria: { q: 'nurse', source: 'nyp,northwell,msk' } });

    expect(res.status).toBe(201);
    expect(res.body.search.criteria.source).toBe('nyp,northwell,msk');
  });

  it('still rejects an unknown source in the list', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/searches')
      .set('Authorization', authHeader(token))
      .send({ name: 'Bogus', criteria: { source: 'nyc,notreal' } });

    expect(res.status).toBe(400);
  });

  it('counts new matches across every source in the list', async () => {
    const { user, token } = await createTestUser();
    await SavedSearch.create({
      user: user._id,
      name: 'Two sources',
      criteria: { source: 'nyc,cuny' },
      lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await createTestJob({ source: 'nyc' });
    await createTestJob({ source: 'cuny' });
    await createTestJob({ source: 'nypl' }); // outside the filter

    const res = await request(app)
      .get('/api/searches')
      .set('Authorization', authHeader(token));

    expect(res.body.searches[0].newCount).toBe(2);
  });
});

describe('runSavedSearchAlerts', () => {
  const { runSavedSearchAlerts } = require('../../helpers/savedSearchAlerts');

  it('counts new matches for alert-enabled searches only', async () => {
    const { user } = await createTestUser();
    await SavedSearch.create({
      user: user._id,
      name: 'Alerting',
      criteria: { q: 'engineer', source: 'all' },
      alertsEnabled: true,
      lastNotifiedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await SavedSearch.create({
      user: user._id,
      name: 'Silent',
      criteria: { q: 'engineer', source: 'all' },
      alertsEnabled: false,
    });
    await createTestJob({ businessTitle: 'Bridge Engineer' });

    const stats = await runSavedSearchAlerts();

    expect(stats.checked).toBe(1);
    expect(stats.notified).toBe(1);
    expect(stats.totalNewJobs).toBe(1);
    // No SMTP configured in tests, so nothing is actually sent
    expect(stats.emailsSent).toBe(0);
  });

  it('advances lastNotifiedAt so the same jobs are not reported twice', async () => {
    const { user } = await createTestUser();
    const search = await SavedSearch.create({
      user: user._id,
      name: 'Alerting',
      criteria: { q: 'engineer', source: 'all' },
      alertsEnabled: true,
      lastNotifiedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await createTestJob({ businessTitle: 'Bridge Engineer' });

    await runSavedSearchAlerts();
    const afterFirst = await SavedSearch.findById(search._id).lean();
    expect(afterFirst.lastNotifiedAt.getTime()).toBeGreaterThan(
      search.lastNotifiedAt.getTime()
    );

    const second = await runSavedSearchAlerts();
    expect(second.notified).toBe(0);
  });

  it('skips searches whose owner has been deactivated', async () => {
    const { user } = await createTestUser();
    await SavedSearch.create({
      user: user._id,
      name: 'Alerting',
      criteria: { q: 'engineer', source: 'all' },
      alertsEnabled: true,
      lastNotifiedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await createTestJob({ businessTitle: 'Bridge Engineer' });
    await User.updateOne({ _id: user._id }, { $set: { isActive: false } });

    const stats = await runSavedSearchAlerts();
    expect(stats.checked).toBe(1);
    expect(stats.notified).toBe(0);
  });
});
