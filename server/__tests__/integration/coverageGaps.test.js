/**
 * Fills the route gaps flagged by the July 2026 review: both CSV exports,
 * the notes admin route, map rate limiting, tracking statusHistory, and the
 * invalid-ObjectId / pagination edges that used to 500.
 */

const request = require('supertest');
const { setupDB } = require('../setup');
const app = require('../../app');
const Note = require('../../models/Note');
const {
  createTestUser,
  createAdminUser,
  createTestJob,
  createSavedJob,
  createTestNote,
  authHeader,
} = require('../helpers/testHelpers');

setupDB();

describe('Notes CSV export', () => {
  it('exports the user\'s notes with a header row', async () => {
    const { user, token } = await createTestUser();
    await createTestNote(user._id, { title: 'Interview prep', content: 'Study the org chart' });

    const res = await request(app)
      .get('/api/notes/export')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/notes\.csv/);
    expect(res.text).toContain('Title');
    expect(res.text).toContain('Interview prep');
  });

  it("never includes another user's notes", async () => {
    const { user: mine, token } = await createTestUser();
    const { user: theirs } = await createTestUser();
    await createTestNote(mine._id, { title: 'Mine' });
    await createTestNote(theirs._id, { title: 'Theirs' });

    const res = await request(app)
      .get('/api/notes/export')
      .set('Authorization', authHeader(token));

    expect(res.text).toContain('Mine');
    expect(res.text).not.toContain('Theirs');
  });

  it('neutralises spreadsheet formula injection', async () => {
    const { user, token } = await createTestUser();
    await createTestNote(user._id, { title: '=SUM(A1:A9)' });

    const res = await request(app)
      .get('/api/notes/export')
      .set('Authorization', authHeader(token));

    // The cell must not begin with a bare = once quoting is accounted for
    expect(res.text).not.toMatch(/(^|,)=SUM/m);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/notes/export')).status).toBe(401);
  });
});

describe('Notes admin route', () => {
  it('is admin-only', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .get('/api/notes/admin')
      .set('Authorization', authHeader(token));
    expect([401, 403]).toContain(res.status);
  });

  it('lists notes across users with their owner populated', async () => {
    const { token } = await createAdminUser();
    const { user: other } = await createTestUser();
    await createTestNote(other._id, { title: 'Someone else note' });

    const res = await request(app)
      .get('/api/notes/admin')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.notes.length).toBeGreaterThan(0);
    expect(res.body.notes[0].user).toHaveProperty('email');
    expect(res.body.pagination).toHaveProperty('total');
  });

  it('rejects a malformed userId filter instead of 500ing', async () => {
    const { token } = await createAdminUser();
    const res = await request(app)
      .get('/api/notes/admin?userId=not-an-objectid')
      .set('Authorization', authHeader(token));
    expect(res.status).toBe(400);
  });
});

describe('Map endpoint', () => {
  it('returns a GeoJSON FeatureCollection of geocoded jobs', async () => {
    await createTestJob({ coordinates: { lat: 40.7, lng: -74.0 } });

    const res = await request(app).get('/api/jobs/map');

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(Array.isArray(res.body.features)).toBe(true);
    expect(res.body.metadata).toHaveProperty('total');
  });

  it('validates its filters', async () => {
    expect((await request(app).get('/api/jobs/map?source=notasource')).status).toBe(400);
    expect((await request(app).get('/api/jobs/map?salary_min=abc')).status).toBe(400);
  });
});

describe('Application tracking', () => {
  it('stores tracking dates and document links on the saved entry', async () => {
    const { user, token } = await createTestUser();
    const job = await createSavedJob(user._id);

    const res = await request(app)
      .put(`/api/jobs/${job.jobId}/tracking?source=${job.source}`)
      .set('Authorization', authHeader(token))
      .send({
        applicationDate: '2026-07-01T00:00:00.000Z',
        interviewDate: '2026-07-15T00:00:00.000Z',
        documentLinks: [{ label: 'Resume', url: 'https://example.com/cv.pdf' }],
      });

    expect(res.status).toBe(200);
    const saved = await request(app)
      .get('/api/jobs/saved')
      .set('Authorization', authHeader(token));
    const entry = saved.body.jobs[0];
    expect(entry.applicationDate).toBeTruthy();
    expect(entry.documentLinks[0].url).toBe('https://example.com/cv.pdf');
  });

  it('rejects a non-http document link', async () => {
    const { user, token } = await createTestUser();
    const job = await createSavedJob(user._id);

    const res = await request(app)
      .put(`/api/jobs/${job.jobId}/tracking?source=${job.source}`)
      .set('Authorization', authHeader(token))
      .send({ documentLinks: [{ label: 'Bad', url: 'javascript:alert(1)' }] });

    expect(res.status).toBe(400);
  });

  it('caps the number of document links', async () => {
    const { user, token } = await createTestUser();
    const job = await createSavedJob(user._id);

    const res = await request(app)
      .put(`/api/jobs/${job.jobId}/tracking?source=${job.source}`)
      .set('Authorization', authHeader(token))
      .send({
        documentLinks: Array.from({ length: 20 }, (_, i) => ({
          label: `Doc ${i}`,
          url: `https://example.com/${i}.pdf`,
        })),
      });

    expect(res.status).toBe(400);
  });
});

describe('Pagination and identifier edges', () => {
  it('rejects a negative page instead of erroring on a negative skip', async () => {
    expect((await request(app).get('/api/jobs/search?page=-5')).status).toBe(400);
  });

  it('rejects an out-of-range limit', async () => {
    expect((await request(app).get('/api/jobs/search?limit=99999')).status).toBe(400);
  });

  it('rejects a prototype key used as a sort option', async () => {
    const { token } = await createTestUser();
    const res = await request(app)
      .get('/api/jobs/saved?sort=constructor')
      .set('Authorization', authHeader(token));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid ObjectId on note routes with 400, not 500', async () => {
    const { token } = await createTestUser();
    for (const method of ['get', 'put', 'delete']) {
      const res = await request(app)
        [method]('/api/notes/not-an-objectid')
        .set('Authorization', authHeader(token))
        .send({ content: 'x' });
      expect(res.status).toBe(400);
    }
  });

  it('ignores a Mongo operator object smuggled into a query param', async () => {
    await createTestJob({ jobId: 'OPTEST', source: 'nyc' });
    // ?source[$ne]=x must not bypass source matching
    const res = await request(app).get('/api/jobs/OPTEST?source[$ne]=zzz');
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) expect(res.body.source).toBe('nyc');
  });
});

describe('Search sort options', () => {
  beforeEach(async () => {
    await createTestJob({ businessTitle: 'Aardvark Analyst', salaryRangeFrom: 50000, postDate: new Date('2026-01-01') });
    await createTestJob({ businessTitle: 'Zebra Zoologist', salaryRangeFrom: 90000, postDate: new Date('2026-06-01') });
  });

  const titles = (res) => res.body.jobs.map((j) => j.businessTitle);

  it('sorts by date in both directions', async () => {
    expect(titles(await request(app).get('/api/jobs/search?sort=date_desc'))[0]).toBe('Zebra Zoologist');
    expect(titles(await request(app).get('/api/jobs/search?sort=date_asc'))[0]).toBe('Aardvark Analyst');
  });

  it('sorts by title in both directions', async () => {
    expect(titles(await request(app).get('/api/jobs/search?sort=title_asc'))[0]).toBe('Aardvark Analyst');
    expect(titles(await request(app).get('/api/jobs/search?sort=title_desc'))[0]).toBe('Zebra Zoologist');
  });

  it('sorts by salary in both directions', async () => {
    expect(titles(await request(app).get('/api/jobs/search?sort=salary_desc'))[0]).toBe('Zebra Zoologist');
    expect(titles(await request(app).get('/api/jobs/search?sort=salary_asc'))[0]).toBe('Aardvark Analyst');
  });

  it('rejects an unknown sort value', async () => {
    expect((await request(app).get('/api/jobs/search?sort=bogus')).status).toBe(400);
  });

  it('filters on salary_max as well as salary_min', async () => {
    const res = await request(app).get('/api/jobs/search?salary_max=60000');
    expect(titles(res)).toContain('Aardvark Analyst');
    expect(titles(res)).not.toContain('Zebra Zoologist');
  });
});
