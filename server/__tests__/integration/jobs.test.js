const request = require('supertest');
const { setupDB } = require('../setup');
const { createTestUser, createTestJob, createSavedJob, createTestNote, authHeader } = require('../helpers/testHelpers');
const { nycApiJobsList, usaJobsSearchResponse } = require('../helpers/fixtures');

jest.mock('axios');
const axios = require('axios');

// Import app AFTER mocking axios
const app = require('../../app');

setupDB();

beforeEach(() => {
  axios.get.mockReset();
  axios.get.mockImplementation((url) => {
    if (url.includes('data.cityofnewyork.us')) {
      return Promise.resolve({ data: nycApiJobsList });
    }
    if (url.includes('data.usajobs.gov')) {
      return Promise.resolve({ data: usaJobsSearchResponse });
    }
    return Promise.reject(new Error(`Unmocked URL: ${url}`));
  });
});

describe('GET /api/jobs/search', () => {
  it('returns paginated NYC jobs with pagination metadata', async () => {
    const res = await request(app)
      .get('/api/jobs/search')
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    expect(res.body.jobs).toBeDefined();
    expect(Array.isArray(res.body.jobs)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination).toHaveProperty('page');
    expect(res.body.pagination).toHaveProperty('limit');
    expect(res.body.pagination).toHaveProperty('total');
    expect(res.body.pagination).toHaveProperty('pages');
    expect(res.body.source).toBe('nyc');
  });

  it('filters by keyword q', async () => {
    const res = await request(app)
      .get('/api/jobs/search')
      .query({ source: 'nyc', q: 'Data Analyst' });

    expect(res.status).toBe(200);
    // The fixture has a "Data Analyst" job so at least one result should match
    expect(res.body.jobs.length).toBeGreaterThanOrEqual(1);
    const titles = res.body.jobs.map((j) => j.businessTitle);
    expect(titles.some((t) => t.includes('Data Analyst'))).toBe(true);
  });

  it('returns isSaved status when authenticated', async () => {
    const { user, token } = await createTestUser();
    // Save a job that matches one of the NYC fixture job IDs
    await createSavedJob(user._id, { jobId: '12345', source: 'nyc' });

    const res = await request(app)
      .get('/api/jobs/search')
      .set('Authorization', authHeader(token))
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    const savedJob = res.body.jobs.find((j) => j.jobId === '12345');
    if (savedJob) {
      expect(savedJob.isSaved).toBe(true);
    }
  });

  it('returns isSaved as false when unauthenticated', async () => {
    const res = await request(app)
      .get('/api/jobs/search')
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    res.body.jobs.forEach((job) => {
      expect(job.isSaved).toBe(false);
    });
  });
});

describe('GET /api/jobs/search (source validation)', () => {
  it('rejects invalid source value', async () => {
    const res = await request(app)
      .get('/api/jobs/search')
      .query({ source: 'invalid_source' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/jobs/categories', () => {
  it('returns sorted categories array', async () => {
    const res = await request(app).get('/api/jobs/categories');

    expect(res.status).toBe(200);
    expect(res.body.categories).toBeDefined();
    expect(Array.isArray(res.body.categories)).toBe(true);
    // Verify sorted order
    const categories = res.body.categories;
    const sorted = [...categories].sort();
    expect(categories).toEqual(sorted);
  });
});

describe('GET /api/jobs/agencies', () => {
  it('returns sorted agencies array', async () => {
    const res = await request(app).get('/api/jobs/agencies');

    expect(res.status).toBe(200);
    expect(res.body.agencies).toBeDefined();
    expect(Array.isArray(res.body.agencies)).toBe(true);
    // Verify sorted order
    const agencies = res.body.agencies;
    const sorted = [...agencies].sort();
    expect(agencies).toEqual(sorted);
  });
});

describe('GET /api/jobs/saved', () => {
  it('returns saved jobs for authenticated user', async () => {
    const { user, token } = await createTestUser();
    await createSavedJob(user._id);
    await createSavedJob(user._id);

    const res = await request(app)
      .get('/api/jobs/saved')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.jobs).toBeDefined();
    expect(res.body.jobs.length).toBe(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(2);
  });

  it('filters by status', async () => {
    const { user, token } = await createTestUser();
    await createSavedJob(user._id); // default status: 'interested'
    await createSavedJob(user._id, {
      savedBy: [{
        user: user._id,
        savedAt: new Date(),
        applicationStatus: 'applied',
        statusUpdatedAt: new Date(),
        statusHistory: [{ status: 'applied', changedAt: new Date() }],
      }],
    });

    const res = await request(app)
      .get('/api/jobs/saved')
      .set('Authorization', authHeader(token))
      .query({ status: 'applied' });

    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBe(1);
    expect(res.body.jobs[0].applicationStatus).toBe('applied');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/jobs/saved');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns NYC job from cache', async () => {
    // First call to /search populates the in-memory cache
    await request(app).get('/api/jobs/search').query({ source: 'nyc' });

    const res = await request(app)
      .get('/api/jobs/12345')
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe('12345');
    expect(res.body.source).toBe('nyc');
    expect(res.body.businessTitle).toBeDefined();
  });

  it('returns 404 for non-existent job', async () => {
    // Populate cache first
    await request(app).get('/api/jobs/search').query({ source: 'nyc' });

    // Mock the NYC API to return empty for the specific job lookup
    axios.get.mockImplementation((url) => {
      if (url.includes('data.cityofnewyork.us')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('data.usajobs.gov')) {
        return Promise.resolve({
          data: { SearchResult: { SearchResultCountAll: '0', SearchResultItems: [] } },
        });
      }
      return Promise.reject(new Error(`Unmocked URL: ${url}`));
    });

    const res = await request(app)
      .get('/api/jobs/nonexistent-id-999')
      .query({ source: 'nyc' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Job not found');
  });
});

describe('POST /api/jobs/:id/save', () => {
  it('saves a job', async () => {
    const { token } = await createTestUser();

    // Mock returns a single NYC job when fetched by job_id
    axios.get.mockImplementation((url) => {
      if (url.includes('data.cityofnewyork.us')) {
        return Promise.resolve({ data: nycApiJobsList });
      }
      return Promise.reject(new Error(`Unmocked URL: ${url}`));
    });

    const res = await request(app)
      .post('/api/jobs/12345/save')
      .set('Authorization', authHeader(token))
      .send({ source: 'nyc' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Job saved successfully');
    expect(res.body.job).toBeDefined();
    expect(res.body.job.jobId).toBe('12345');
  });

  it('returns 400 when already saved', async () => {
    const { user, token } = await createTestUser();
    await createSavedJob(user._id, { jobId: 'already-saved-1', source: 'nyc' });

    const res = await request(app)
      .post('/api/jobs/already-saved-1/save')
      .set('Authorization', authHeader(token))
      .send({ source: 'nyc' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Job already saved');
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/jobs/12345/save')
      .send({ source: 'nyc' });

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/jobs/:id/save', () => {
  it('unsaves a job', async () => {
    const { user, token } = await createTestUser();
    await createSavedJob(user._id, { jobId: 'unsave-me', source: 'nyc' });

    const res = await request(app)
      .delete('/api/jobs/unsave-me/save')
      .set('Authorization', authHeader(token))
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Job unsaved successfully');
  });

  it('returns 404 for non-existent job', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .delete('/api/jobs/does-not-exist/save')
      .set('Authorization', authHeader(token))
      .query({ source: 'nyc' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Job not found');
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .delete('/api/jobs/12345/save')
      .query({ source: 'nyc' });

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/jobs/:id/status', () => {
  it('updates status and adds to statusHistory', async () => {
    const { user, token } = await createTestUser();
    await createSavedJob(user._id, { jobId: 'status-job', source: 'nyc' });

    const res = await request(app)
      .put('/api/jobs/status-job/status')
      .set('Authorization', authHeader(token))
      .send({ status: 'applied', source: 'nyc' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Application status updated');
    expect(res.body.applicationStatus).toBe('applied');
    expect(res.body.statusHistory).toBeDefined();
    expect(Array.isArray(res.body.statusHistory)).toBe(true);
    // Should have at least 2 entries: initial 'interested' + new 'applied'
    expect(res.body.statusHistory.length).toBeGreaterThanOrEqual(2);
    const lastEntry = res.body.statusHistory[res.body.statusHistory.length - 1];
    expect(lastEntry.status).toBe('applied');
  });

  it('returns 400 for invalid status', async () => {
    const { user, token } = await createTestUser();
    await createSavedJob(user._id, { jobId: 'invalid-status-job', source: 'nyc' });

    const res = await request(app)
      .put('/api/jobs/invalid-status-job/status')
      .set('Authorization', authHeader(token))
      .send({ status: 'invalid_status', source: 'nyc' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('returns 400 when job not saved by user', async () => {
    const { token } = await createTestUser();
    // Create a job that is NOT saved by this user
    await createTestJob({ jobId: 'not-saved-job', source: 'nyc' });

    const res = await request(app)
      .put('/api/jobs/not-saved-job/status')
      .set('Authorization', authHeader(token))
      .send({ status: 'applied', source: 'nyc' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Job is not saved');
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .put('/api/jobs/12345/status')
      .send({ status: 'applied', source: 'nyc' });

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/jobs/:id/tracking', () => {
  it('updates tracking dates successfully', async () => {
    const { user, token } = await createTestUser();
    await createSavedJob(user._id, { jobId: 'track-dates', source: 'nyc' });

    const res = await request(app)
      .put('/api/jobs/track-dates/tracking')
      .set('Authorization', authHeader(token))
      .send({
        applicationDate: '2026-03-01',
        interviewDate: '2026-03-10',
        source: 'nyc',
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Tracking info updated');
    expect(res.body.applicationDate).toBeTruthy();
    expect(res.body.interviewDate).toBeTruthy();
    expect(res.body.followUpDate).toBeNull();
  });

  it('updates document links successfully', async () => {
    const { user, token } = await createTestUser();
    await createSavedJob(user._id, { jobId: 'track-links', source: 'nyc' });

    const res = await request(app)
      .put('/api/jobs/track-links/tracking')
      .set('Authorization', authHeader(token))
      .send({
        documentLinks: [
          { label: 'Resume', url: 'https://example.com/resume.pdf' },
          { label: 'Cover Letter', url: 'https://example.com/cover.pdf' },
        ],
        source: 'nyc',
      });

    expect(res.status).toBe(200);
    expect(res.body.documentLinks).toHaveLength(2);
    expect(res.body.documentLinks[0].label).toBe('Resume');
  });

  it('clears a date by sending null', async () => {
    const { user, token } = await createTestUser();
    await createSavedJob(user._id, { jobId: 'track-clear', source: 'nyc' });

    // Set a date first
    await request(app)
      .put('/api/jobs/track-clear/tracking')
      .set('Authorization', authHeader(token))
      .send({ applicationDate: '2026-03-01', source: 'nyc' });

    // Clear it
    const res = await request(app)
      .put('/api/jobs/track-clear/tracking')
      .set('Authorization', authHeader(token))
      .send({ applicationDate: null, source: 'nyc' });

    expect(res.status).toBe(200);
    expect(res.body.applicationDate).toBeNull();
  });

  it('rejects invalid date format', async () => {
    const { user, token } = await createTestUser();
    await createSavedJob(user._id, { jobId: 'track-bad-date', source: 'nyc' });

    const res = await request(app)
      .put('/api/jobs/track-bad-date/tracking')
      .set('Authorization', authHeader(token))
      .send({ applicationDate: 'not-a-date', source: 'nyc' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('rejects more than 5 document links', async () => {
    const { user, token } = await createTestUser();
    await createSavedJob(user._id, { jobId: 'track-many-links', source: 'nyc' });

    const links = Array.from({ length: 6 }, (_, i) => ({
      label: `Doc ${i}`,
      url: `https://example.com/doc${i}.pdf`,
    }));

    const res = await request(app)
      .put('/api/jobs/track-many-links/tracking')
      .set('Authorization', authHeader(token))
      .send({ documentLinks: links, source: 'nyc' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid URL in document link', async () => {
    const { user, token } = await createTestUser();
    await createSavedJob(user._id, { jobId: 'track-bad-url', source: 'nyc' });

    const res = await request(app)
      .put('/api/jobs/track-bad-url/tracking')
      .set('Authorization', authHeader(token))
      .send({
        documentLinks: [{ label: 'Bad', url: 'not-a-url' }],
        source: 'nyc',
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when job not saved by user', async () => {
    const { token } = await createTestUser();
    await createTestJob({ jobId: 'track-unsaved', source: 'nyc' });

    const res = await request(app)
      .put('/api/jobs/track-unsaved/tracking')
      .set('Authorization', authHeader(token))
      .send({ applicationDate: '2026-03-01', source: 'nyc' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Job is not saved');
  });

  it('returns 404 for non-existent job', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .put('/api/jobs/does-not-exist/tracking')
      .set('Authorization', authHeader(token))
      .send({ applicationDate: '2026-03-01', source: 'nyc' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Job not found');
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .put('/api/jobs/12345/tracking')
      .send({ applicationDate: '2026-03-01', source: 'nyc' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/jobs/saved (note counts)', () => {
  it('includes noteCount in saved jobs response', async () => {
    const { user, token } = await createTestUser();
    const job = await createSavedJob(user._id, { jobId: 'note-count-job', source: 'nyc' });

    await createTestNote(user._id, { jobId: job.jobId });
    await createTestNote(user._id, { jobId: job.jobId });

    const res = await request(app)
      .get('/api/jobs/saved')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    const savedJob = res.body.jobs.find((j) => j.jobId === 'note-count-job');
    expect(savedJob).toBeDefined();
    expect(savedJob.noteCount).toBe(2);
  });
});
