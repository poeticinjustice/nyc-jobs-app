const request = require('supertest');
const mongoose = require('mongoose');
const { setupDB } = require('../setup');
const app = require('../../app');
const {
  createTestUser,
  createAdminUser,
  authHeader,
} = require('../helpers/testHelpers');

setupDB();

describe('GET /api/users/stats', () => {
  it('returns stats for admin', async () => {
    const { token } = await createAdminUser();

    // Create a few regular users so stats have data
    await createTestUser();
    await createTestUser();

    const res = await request(app)
      .get('/api/users/stats')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalUsers');
    expect(res.body).toHaveProperty('activeUsers');
    expect(res.body).toHaveProperty('byRole');
    expect(res.body).toHaveProperty('recentUsers');
    expect(res.body.totalUsers).toBeGreaterThanOrEqual(3); // admin + 2 users
  });

  it('returns 403 for regular user', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .get('/api/users/stats')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(403);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/users/stats');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/users', () => {
  it('returns paginated users for admin', async () => {
    const { token } = await createAdminUser();

    await createTestUser();
    await createTestUser();

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.users).toBeDefined();
    expect(res.body.users.length).toBeGreaterThanOrEqual(3);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(3);

    // Ensure passwords are not returned
    res.body.users.forEach((u) => {
      expect(u.password).toBeUndefined();
    });
  });

  it('returns 403 for regular user', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(403);
  });
});

describe('GET /api/users/:id', () => {
  it('admin can get any user', async () => {
    const { token: adminToken } = await createAdminUser();
    const { user: regularUser } = await createTestUser();

    const res = await request(app)
      .get(`/api/users/${regularUser._id}`)
      .set('Authorization', authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user._id.toString()).toBe(regularUser._id.toString());
    expect(res.body.user.password).toBeUndefined();
  });

  it('regular user can get own profile', async () => {
    const { user, token } = await createTestUser();

    const res = await request(app)
      .get(`/api/users/${user._id}`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.user._id.toString()).toBe(user._id.toString());
  });

  it('returns 403 when non-admin accesses another user', async () => {
    const { token } = await createTestUser();
    const { user: otherUser } = await createTestUser();

    const res = await request(app)
      .get(`/api/users/${otherUser._id}`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/users/:id', () => {
  it('user updates own profile', async () => {
    const { user, token } = await createTestUser();

    const res = await request(app)
      .put(`/api/users/${user._id}`)
      .set('Authorization', authHeader(token))
      .send({ firstName: 'Updated', lastName: 'Name' });

    expect(res.status).toBe(200);
    expect(res.body.user.firstName).toBe('Updated');
    expect(res.body.user.lastName).toBe('Name');
  });

  it('admin can update role', async () => {
    const { token: adminToken } = await createAdminUser();
    const { user } = await createTestUser();

    const res = await request(app)
      .put(`/api/users/${user._id}`)
      .set('Authorization', authHeader(adminToken))
      .send({ role: 'moderator' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('moderator');
  });

  it('regular user cannot update role (403)', async () => {
    const { user, token } = await createTestUser();

    const res = await request(app)
      .put(`/api/users/${user._id}`)
      .set('Authorization', authHeader(token))
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/users/:id', () => {
  it('admin deactivates a user', async () => {
    const { token: adminToken } = await createAdminUser();
    const { user } = await createTestUser();

    const res = await request(app)
      .delete(`/api/users/${user._id}`)
      .set('Authorization', authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deactivated/i);

    // Verify the user is now inactive via admin GET
    const getRes = await request(app)
      .get(`/api/users/${user._id}`)
      .set('Authorization', authHeader(adminToken));

    expect(getRes.status).toBe(200);
    expect(getRes.body.user.isActive).toBe(false);
  });

  it('returns 400 when admin tries to delete self', async () => {
    const { user: admin, token: adminToken } = await createAdminUser();

    const res = await request(app)
      .delete(`/api/users/${admin._id}`)
      .set('Authorization', authHeader(adminToken));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot delete your own/i);
  });

  it('returns 403 for non-admin', async () => {
    const { token } = await createTestUser();
    const { user: otherUser } = await createTestUser();

    const res = await request(app)
      .delete(`/api/users/${otherUser._id}`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(403);
  });
});

describe('POST /api/users/:id/reactivate', () => {
  it('admin reactivates a deactivated user', async () => {
    const { token: adminToken } = await createAdminUser();
    const { user } = await createTestUser({ isActive: false });

    const res = await request(app)
      .post(`/api/users/${user._id}/reactivate`)
      .set('Authorization', authHeader(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reactivated/i);

    // Verify the user is active again
    const getRes = await request(app)
      .get(`/api/users/${user._id}`)
      .set('Authorization', authHeader(adminToken));

    expect(getRes.status).toBe(200);
    expect(getRes.body.user.isActive).toBe(true);
  });

  it('returns 403 for non-admin', async () => {
    const { token } = await createTestUser();
    const { user: otherUser } = await createTestUser({ isActive: false });

    const res = await request(app)
      .post(`/api/users/${otherUser._id}/reactivate`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(403);
  });
});
