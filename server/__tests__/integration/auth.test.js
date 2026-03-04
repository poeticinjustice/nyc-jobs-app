const request = require('supertest');
const { setupDB } = require('../setup');
const app = require('../../app');
const { createTestUser, authHeader } = require('../helpers/testHelpers');

setupDB();

describe('POST /api/auth/register', () => {
  const validUser = {
    email: 'newuser@example.com',
    password: 'password123',
    firstName: 'Jane',
    lastName: 'Doe',
  };

  it('registers a user and returns 201 with token and user (no password field)', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(validUser.email);
    expect(res.body.user.firstName).toBe(validUser.firstName);
    expect(res.body.user.lastName).toBe(validUser.lastName);
    expect(res.body.user.password).toBeUndefined();
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('returns 400 for short password (< 6 chars)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'short@example.com', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('returns 400 for missing firstName', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'nofirst@example.com', password: 'password123', lastName: 'Doe' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('returns 400 for missing lastName', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'nolast@example.com', password: 'password123', firstName: 'Jane' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('returns 400 for duplicate email', async () => {
    await createTestUser({ email: 'dupe@example.com' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'dupe@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('User already exists');
  });
});

describe('POST /api/auth/login', () => {
  let testEmail;

  beforeEach(async () => {
    testEmail = `login-${Date.now()}@example.com`;
    await createTestUser({ email: testEmail, password: 'password123' });
  });

  it('logs in and returns 200 with token and user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.message).toBe('Login successful');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('returns 401 for deactivated account', async () => {
    const deactivatedEmail = `deactivated-${Date.now()}@example.com`;
    await createTestUser({ email: deactivatedEmail, password: 'password123', isActive: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: deactivatedEmail, password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Account is deactivated');
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });
});

describe('GET /api/auth/me', () => {
  it('returns user profile with valid token', async () => {
    const { user, token } = await createTestUser();

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.password).toBeUndefined();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Access token required');
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-jwt-token-here');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid token');
  });
});

describe('PUT /api/auth/profile', () => {
  it('updates firstName', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', authHeader(token))
      .send({ firstName: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.user.firstName).toBe('Updated');
    expect(res.body.message).toBe('Profile updated successfully');
  });

  it('updates email', async () => {
    const { token } = await createTestUser();
    const newEmail = `updated-${Date.now()}@example.com`;

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', authHeader(token))
      .send({ email: newEmail });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(newEmail);
  });

  it('returns 400 when email is taken by another user', async () => {
    const { user: otherUser } = await createTestUser();
    const { token } = await createTestUser();

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', authHeader(token))
      .send({ email: otherUser.email });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Email already in use');
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .put('/api/auth/profile')
      .send({ firstName: 'NoAuth' });

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/auth/password', () => {
  it('changes password successfully', async () => {
    const { token } = await createTestUser({ password: 'oldpassword123' });

    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', authHeader(token))
      .send({ currentPassword: 'oldpassword123', newPassword: 'newpassword456' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password updated successfully');
  });

  it('returns 400 for wrong current password', async () => {
    const { token } = await createTestUser({ password: 'realpassword' });

    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', authHeader(token))
      .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword456' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Current password is incorrect');
  });

  it('returns 400 for short new password', async () => {
    const { token } = await createTestUser({ password: 'oldpassword123' });

    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', authHeader(token))
      .send({ currentPassword: 'oldpassword123', newPassword: '123' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('can login with new password after change', async () => {
    const email = `pwchange-${Date.now()}@example.com`;
    const { token } = await createTestUser({ email, password: 'oldpassword123' });

    await request(app)
      .put('/api/auth/password')
      .set('Authorization', authHeader(token))
      .send({ currentPassword: 'oldpassword123', newPassword: 'newpassword456' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'newpassword456' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .put('/api/auth/password')
      .send({ currentPassword: 'oldpassword123', newPassword: 'newpassword456' });

    expect(res.status).toBe(401);
  });
});
