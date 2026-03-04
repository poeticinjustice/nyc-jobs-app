const request = require('supertest');
const { setupDB } = require('../setup');
const app = require('../../app');
const {
  createTestUser,
  createSavedJob,
  createTestNote,
  createTestSearch,
  authHeader,
} = require('../helpers/testHelpers');

setupDB();

describe('GET /api/dashboard', () => {
  it('returns the complete dashboard structure', async () => {
    const { user, token } = await createTestUser();

    // Seed some data
    await createSavedJob(user._id);
    await createTestNote(user._id);
    await createTestSearch(user._id);

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('statusCounts');
    expect(res.body).toHaveProperty('totalSavedJobs');
    expect(res.body).toHaveProperty('totalNotes');
    expect(res.body).toHaveProperty('totalSavedSearches');
    expect(res.body).toHaveProperty('recentSavedJobs');
    expect(res.body).toHaveProperty('recentNotes');
  });

  it('returns correct statusCounts with seeded saved jobs', async () => {
    const { user, token } = await createTestUser();

    // Create saved jobs with different application statuses
    await createSavedJob(user._id, {
      savedBy: [{
        user: user._id,
        savedAt: new Date(),
        applicationStatus: 'interested',
        statusUpdatedAt: new Date(),
        statusHistory: [{ status: 'interested', changedAt: new Date() }],
      }],
    });
    await createSavedJob(user._id, {
      savedBy: [{
        user: user._id,
        savedAt: new Date(),
        applicationStatus: 'applied',
        statusUpdatedAt: new Date(),
        statusHistory: [{ status: 'applied', changedAt: new Date() }],
      }],
    });
    await createSavedJob(user._id, {
      savedBy: [{
        user: user._id,
        savedAt: new Date(),
        applicationStatus: 'applied',
        statusUpdatedAt: new Date(),
        statusHistory: [{ status: 'applied', changedAt: new Date() }],
      }],
    });
    await createSavedJob(user._id, {
      savedBy: [{
        user: user._id,
        savedAt: new Date(),
        applicationStatus: 'interviewing',
        statusUpdatedAt: new Date(),
        statusHistory: [{ status: 'interviewing', changedAt: new Date() }],
      }],
    });

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.totalSavedJobs).toBe(4);
    expect(res.body.statusCounts.interested).toBe(1);
    expect(res.body.statusCounts.applied).toBe(2);
    expect(res.body.statusCounts.interviewing).toBe(1);
    expect(res.body.statusCounts.offered).toBe(0);
    expect(res.body.statusCounts.rejected).toBe(0);
  });

  it('returns zero counts for a new user with no data', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.totalSavedJobs).toBe(0);
    expect(res.body.totalNotes).toBe(0);
    expect(res.body.totalSavedSearches).toBe(0);
    expect(res.body.recentSavedJobs).toEqual([]);
    expect(res.body.recentNotes).toEqual([]);
    expect(res.body.statusCounts).toEqual({
      interested: 0,
      applied: 0,
      interviewing: 0,
      offered: 0,
      rejected: 0,
    });
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/dashboard');

    expect(res.status).toBe(401);
  });
});
