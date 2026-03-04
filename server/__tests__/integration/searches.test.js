const request = require('supertest');
const mongoose = require('mongoose');
const { setupDB } = require('../setup');
const app = require('../../app');
const {
  createTestUser,
  createTestSearch,
  authHeader,
} = require('../helpers/testHelpers');

setupDB();

describe('GET /api/searches', () => {
  it('returns saved searches for the user', async () => {
    const { user, token } = await createTestUser();

    await createTestSearch(user._id, { name: 'React jobs' });
    await createTestSearch(user._id, { name: 'Python jobs' });

    const res = await request(app)
      .get('/api/searches')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.searches).toHaveLength(2);
  });

  it('returns empty array when user has no saved searches', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .get('/api/searches')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.searches).toEqual([]);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/searches');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/searches', () => {
  it('creates a saved search and returns 201', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/searches')
      .set('Authorization', authHeader(token))
      .send({
        name: 'Developer jobs in Manhattan',
        criteria: { q: 'developer', location: 'Manhattan' },
      });

    expect(res.status).toBe(201);
    expect(res.body.search).toBeDefined();
    expect(res.body.search.name).toBe('Developer jobs in Manhattan');
    expect(res.body.search.criteria.q).toBe('developer');
    expect(res.body.search.criteria.location).toBe('Manhattan');
  });

  it('returns 400 for missing name', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/searches')
      .set('Authorization', authHeader(token))
      .send({
        criteria: { q: 'engineer' },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/validation/i);
  });

  it('enforces 20-search limit', async () => {
    const { user, token } = await createTestUser();

    // Create 20 searches directly in the database
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(createTestSearch(user._id, { name: `Search ${i}` }));
    }
    await Promise.all(promises);

    // The 21st should be rejected
    const res = await request(app)
      .post('/api/searches')
      .set('Authorization', authHeader(token))
      .send({
        name: 'One too many',
        criteria: { q: 'overflow' },
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/maximum/i);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/searches')
      .send({ name: 'No Auth Search', criteria: { q: 'test' } });

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/searches/:id', () => {
  it('deletes a saved search', async () => {
    const { user, token } = await createTestUser();
    const search = await createTestSearch(user._id, { name: 'To Delete' });

    const res = await request(app)
      .delete(`/api/searches/${search._id}`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);

    // Verify it is actually gone
    const listRes = await request(app)
      .get('/api/searches')
      .set('Authorization', authHeader(token));
    expect(listRes.body.searches).toHaveLength(0);
  });

  it('returns 404 for non-existent search', async () => {
    const { token } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .delete(`/api/searches/${fakeId}`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(404);
  });

  it('returns 404 when deleting another user search', async () => {
    const { user: otherUser } = await createTestUser();
    const { token } = await createTestUser();
    const search = await createTestSearch(otherUser._id, { name: 'Not Yours' });

    const res = await request(app)
      .delete(`/api/searches/${search._id}`)
      .set('Authorization', authHeader(token));

    // Atomic delete returns 404 (not 403) to avoid revealing resource existence
    expect(res.status).toBe(404);
  });

  it('returns 401 without token', async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app).delete(`/api/searches/${fakeId}`);

    expect(res.status).toBe(401);
  });
});
