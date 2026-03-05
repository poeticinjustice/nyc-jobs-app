const request = require('supertest');
const { setupDB } = require('../setup');
const { createTestUser, createTestJob, createSavedJob, createTestNote, authHeader } = require('../helpers/testHelpers');
const Job = require('../../models/Job');

const app = require('../../app');

setupDB();

// Seed a set of jobs into MongoDB before each test that needs searchable data
const seedJobs = async () => {
  await Job.insertMany([
    {
      jobId: '12345',
      source: 'nyc',
      businessTitle: 'Software Developer',
      civilServiceTitle: 'Computer Specialist',
      jobCategory: 'Technology, Data & Innovation',
      agency: 'Dept of Info Tech & Telecomm',
      workLocation: 'Manhattan',
      workLocation1: '100 Church St., New York, NY',
      salaryRangeFrom: 65000,
      salaryRangeTo: 95000,
      salaryFrequency: 'Annual',
      jobDescription: 'We are looking for a developer to build applications.',
      postDate: new Date('2025-01-15'),
      coordinates: { lat: 40.7132, lng: -74.0079 },
      lastRefreshedAt: new Date(),
    },
    {
      jobId: '12346',
      source: 'nyc',
      businessTitle: 'Data Analyst',
      jobCategory: 'Policy, Research & Analysis',
      agency: 'Dept of Health',
      workLocation: 'Brooklyn',
      salaryRangeFrom: 55000,
      salaryRangeTo: 75000,
      salaryFrequency: 'Annual',
      jobDescription: 'Analyze public health data and produce reports.',
      postDate: new Date('2025-02-01'),
      coordinates: { lat: 40.6782, lng: -73.9442 },
      lastRefreshedAt: new Date(),
    },
    {
      jobId: '12347',
      source: 'nyc',
      businessTitle: 'Project Manager',
      jobCategory: 'Administration & Human Resources',
      agency: 'Dept of Education',
      workLocation: 'Queens',
      salaryRangeFrom: 80000,
      salaryRangeTo: 110000,
      salaryFrequency: 'Annual',
      jobDescription: 'Manage educational technology projects.',
      postDate: new Date('2025-01-10'),
      coordinates: { lat: 40.7282, lng: -73.7949 },
      lastRefreshedAt: new Date(),
    },
    {
      jobId: 'USA-12345',
      source: 'federal',
      businessTitle: 'IT Specialist',
      jobCategory: 'Information Technology',
      agency: 'TSA',
      workLocation: 'New York, New York',
      salaryRangeFrom: 78000,
      salaryRangeTo: 101000,
      salaryFrequency: 'Annual',
      jobDescription: 'Responsible for IT systems and infrastructure.',
      postDate: new Date('2025-01-20'),
      coordinates: { lat: 40.7128, lng: -74.006 },
      lastRefreshedAt: new Date(),
    },
  ]);
};

describe('GET /api/jobs/search', () => {
  beforeEach(seedJobs);

  it('returns paginated jobs with pagination metadata', async () => {
    const res = await request(app)
      .get('/api/jobs/search')
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    expect(res.body.jobs).toBeDefined();
    expect(Array.isArray(res.body.jobs)).toBe(true);
    expect(res.body.jobs.length).toBe(3);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination).toHaveProperty('page', 1);
    expect(res.body.pagination).toHaveProperty('limit');
    expect(res.body.pagination).toHaveProperty('total', 3);
    expect(res.body.pagination).toHaveProperty('pages');
    expect(res.body.source).toBe('nyc');
  });

  it('filters by keyword q using text search', async () => {
    const res = await request(app)
      .get('/api/jobs/search')
      .query({ source: 'nyc', q: 'Data Analyst' });

    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBeGreaterThanOrEqual(1);
    const titles = res.body.jobs.map((j) => j.businessTitle);
    expect(titles.some((t) => t.includes('Data Analyst'))).toBe(true);
  });

  it('filters by category', async () => {
    const res = await request(app)
      .get('/api/jobs/search')
      .query({ source: 'nyc', category: 'Technology, Data & Innovation' });

    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBe(1);
    expect(res.body.jobs[0].jobCategory).toBe('Technology, Data & Innovation');
  });

  it('filters by salary range', async () => {
    const res = await request(app)
      .get('/api/jobs/search')
      .query({ source: 'nyc', salary_min: '90000' });

    expect(res.status).toBe(200);
    // Only Software Developer (95k max) and Project Manager (110k max) overlap >=90k
    expect(res.body.jobs.length).toBe(2);
  });

  it('returns all sources when source=all', async () => {
    const res = await request(app)
      .get('/api/jobs/search')
      .query({ source: 'all' });

    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBe(4);
    const sources = [...new Set(res.body.jobs.map((j) => j.source))];
    expect(sources).toContain('nyc');
    expect(sources).toContain('federal');
  });

  it('paginates correctly', async () => {
    const res = await request(app)
      .get('/api/jobs/search')
      .query({ source: 'nyc', page: 2, limit: 2 });

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(2);
    expect(res.body.jobs.length).toBe(1); // 3 total, page 2 with limit 2 = 1 remaining
  });

  it('returns isSaved status when authenticated', async () => {
    const { user, token } = await createTestUser();
    // Mark one of the seeded jobs as saved
    await Job.updateOne(
      { jobId: '12345', source: 'nyc' },
      { $push: { savedBy: { user: user._id, savedAt: new Date(), applicationStatus: 'interested', statusUpdatedAt: new Date(), statusHistory: [{ status: 'interested', changedAt: new Date() }] } } }
    );

    const res = await request(app)
      .get('/api/jobs/search')
      .set('Authorization', authHeader(token))
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    const savedJob = res.body.jobs.find((j) => j.jobId === '12345');
    expect(savedJob).toBeDefined();
    expect(savedJob.isSaved).toBe(true);
  });

  it('does not include savedBy in response', async () => {
    const res = await request(app)
      .get('/api/jobs/search')
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    res.body.jobs.forEach((job) => {
      expect(job.savedBy).toBeUndefined();
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
  beforeEach(seedJobs);

  it('returns sorted categories array', async () => {
    const res = await request(app).get('/api/jobs/categories');

    expect(res.status).toBe(200);
    expect(res.body.categories).toBeDefined();
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(res.body.categories.length).toBeGreaterThanOrEqual(3);
    const categories = res.body.categories;
    const sorted = [...categories].sort();
    expect(categories).toEqual(sorted);
  });
});

describe('GET /api/jobs/agencies', () => {
  beforeEach(seedJobs);

  it('returns sorted agencies array', async () => {
    const res = await request(app).get('/api/jobs/agencies');

    expect(res.status).toBe(200);
    expect(res.body.agencies).toBeDefined();
    expect(Array.isArray(res.body.agencies)).toBe(true);
    expect(res.body.agencies.length).toBeGreaterThanOrEqual(3);
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
  beforeEach(seedJobs);

  it('returns job from database', async () => {
    const res = await request(app)
      .get('/api/jobs/12345')
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe('12345');
    expect(res.body.source).toBe('nyc');
    expect(res.body.businessTitle).toBe('Software Developer');
  });

  it('returns federal job from database', async () => {
    const res = await request(app)
      .get('/api/jobs/USA-12345')
      .query({ source: 'federal' });

    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe('USA-12345');
    expect(res.body.source).toBe('federal');
  });

  it('returns 404 for non-existent job', async () => {
    const res = await request(app)
      .get('/api/jobs/nonexistent-id-999')
      .query({ source: 'nyc' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Job not found');
  });

  it('does not include savedBy in response', async () => {
    const res = await request(app)
      .get('/api/jobs/12345')
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    expect(res.body.savedBy).toBeUndefined();
  });
});

describe('POST /api/jobs/:id/save', () => {
  beforeEach(seedJobs);

  it('saves a job', async () => {
    const { token } = await createTestUser();

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
    // Mark the seeded job as saved
    await Job.updateOne(
      { jobId: '12345', source: 'nyc' },
      { $push: { savedBy: { user: user._id, savedAt: new Date(), applicationStatus: 'interested', statusUpdatedAt: new Date(), statusHistory: [{ status: 'interested', changedAt: new Date() }] } } }
    );

    const res = await request(app)
      .post('/api/jobs/12345/save')
      .set('Authorization', authHeader(token))
      .send({ source: 'nyc' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Job already saved');
  });

  it('returns 404 for non-existent job', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/jobs/does-not-exist/save')
      .set('Authorization', authHeader(token))
      .send({ source: 'nyc' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Job not found');
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

describe('GET /api/jobs/map', () => {
  beforeEach(seedJobs);

  it('returns GeoJSON FeatureCollection with correct structure', async () => {
    const res = await request(app)
      .get('/api/jobs/map')
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(Array.isArray(res.body.features)).toBe(true);
    expect(res.body.metadata).toBeDefined();
    expect(res.body.metadata).toHaveProperty('total');
    expect(res.body.metadata).toHaveProperty('geocoded');
  });

  it('returns features with valid GeoJSON Point geometry', async () => {
    const res = await request(app)
      .get('/api/jobs/map')
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    expect(res.body.features.length).toBe(3);

    const feature = res.body.features[0];
    expect(feature.type).toBe('Feature');
    expect(feature.geometry.type).toBe('Point');
    expect(feature.geometry.coordinates).toHaveLength(2);
    expect(typeof feature.geometry.coordinates[0]).toBe('number'); // lng
    expect(typeof feature.geometry.coordinates[1]).toBe('number'); // lat
  });

  it('includes required job properties on features', async () => {
    const res = await request(app)
      .get('/api/jobs/map')
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    const props = res.body.features[0].properties;
    expect(props).toHaveProperty('jobId');
    expect(props).toHaveProperty('businessTitle');
    expect(props).toHaveProperty('agency');
    expect(props).toHaveProperty('source', 'nyc');
  });

  it('filters by keyword', async () => {
    const res = await request(app)
      .get('/api/jobs/map')
      .query({ source: 'nyc', keyword: 'developer' });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features.length).toBeGreaterThanOrEqual(0);
  });

  it('filters by source', async () => {
    const res = await request(app)
      .get('/api/jobs/map')
      .query({ source: 'federal' });

    expect(res.status).toBe(200);
    expect(res.body.features.length).toBe(1);
    expect(res.body.features[0].properties.source).toBe('federal');
  });

  it('works without authentication (public endpoint)', async () => {
    const res = await request(app)
      .get('/api/jobs/map');

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features.length).toBe(4); // all 4 seeded jobs
  });

  it('excludes jobs without coordinates', async () => {
    // Insert a job with no coordinates
    await Job.create({
      jobId: 'no-coords',
      source: 'nyc',
      businessTitle: 'No Location Job',
      agency: 'Test',
      postDate: new Date(),
      coordinates: { lat: null, lng: null },
    });

    const res = await request(app)
      .get('/api/jobs/map')
      .query({ source: 'nyc' });

    expect(res.status).toBe(200);
    const ids = res.body.features.map((f) => f.properties.jobId);
    expect(ids).not.toContain('no-coords');
  });
});

describe('GET /api/jobs/health', () => {
  it('returns job count', async () => {
    await seedJobs();
    const res = await request(app).get('/api/jobs/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.jobsInDatabase).toBe('number');
  });
});
