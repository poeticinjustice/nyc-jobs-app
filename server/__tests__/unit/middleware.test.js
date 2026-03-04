const jwt = require('jsonwebtoken');
const { setupDB } = require('../setup');
const { createTestUser } = require('../helpers/testHelpers');
const { authenticateToken, optionalAuth, requireRole } = require('../../middleware/auth');

setupDB();

// -- Mock helpers ----------------------------------------------------------
const mockReq = (overrides = {}) => ({ headers: {}, ...overrides });

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

// Reset mockNext before each test
beforeEach(() => {
  mockNext.mockClear();
});

// ---------------------------------------------------------------------------
// authenticateToken
// ---------------------------------------------------------------------------
describe('authenticateToken', () => {
  it('sets req.user and calls next() for a valid token', async () => {
    const { user, token } = await createTestUser();
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();

    await authenticateToken(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.user).toBeDefined();
    expect(req.user._id.toString()).toBe(user._id.toString());
    expect(req.user.email).toBe(user.email);
    // Password should be excluded via .select('-password')
    expect(req.user.password).toBeUndefined();
  });

  it('returns 401 when no Authorization header is present', async () => {
    const req = mockReq();
    const res = mockRes();

    await authenticateToken(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Access token required' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header has wrong format (no Bearer prefix)', async () => {
    const { token } = await createTestUser();
    const req = mockReq({ headers: { authorization: token } });
    const res = mockRes();

    await authenticateToken(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Access token required' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid/malformed token', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer not.a.valid.token' } });
    const res = mockRes();

    await authenticateToken(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 401 for an expired token', async () => {
    const { user } = await createTestUser();
    const expiredToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '0s' }
    );
    // Small delay to ensure token is expired
    await new Promise((resolve) => setTimeout(resolve, 10));

    const req = mockReq({ headers: { authorization: `Bearer ${expiredToken}` } });
    const res = mockRes();

    await authenticateToken(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Token expired' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 401 when user is not found in the database', async () => {
    const mongoose = require('mongoose');
    const fakeId = new mongoose.Types.ObjectId();
    const token = jwt.sign({ userId: fakeId }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();

    await authenticateToken(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 401 when user is deactivated (isActive: false)', async () => {
    const { user } = await createTestUser({ isActive: false });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();

    await authenticateToken(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Account is deactivated' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header says "Bearer " with empty token', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer ' } });
    const res = mockRes();

    await authenticateToken(req, res, mockNext);

    // 'Bearer '.split(' ')[1] === '' which is falsy
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// optionalAuth
// ---------------------------------------------------------------------------
describe('optionalAuth', () => {
  it('sets req.user and calls next() for a valid token', async () => {
    const { user, token } = await createTestUser();
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();

    await optionalAuth(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.user).toBeDefined();
    expect(req.user._id.toString()).toBe(user._id.toString());
  });

  it('calls next() without setting req.user when no token is present', async () => {
    const req = mockReq();
    const res = mockRes();

    await optionalAuth(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });

  it('calls next() without setting req.user for an invalid token', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer invalid.token.here' } });
    const res = mockRes();

    await optionalAuth(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });

  it('calls next() without setting req.user when user is deactivated', async () => {
    const { user } = await createTestUser({ isActive: false });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();

    await optionalAuth(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });

  it('calls next() without setting req.user when user does not exist in DB', async () => {
    const mongoose = require('mongoose');
    const fakeId = new mongoose.Types.ObjectId();
    const token = jwt.sign({ userId: fakeId }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();

    await optionalAuth(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });

  it('does not return an error response for any token issue', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer expired.or.bad' } });
    const res = mockRes();

    await optionalAuth(req, res, mockNext);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('calls next() without setting req.user for an expired token', async () => {
    const { user } = await createTestUser();
    const expiredToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '0s' }
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    const req = mockReq({ headers: { authorization: `Bearer ${expiredToken}` } });
    const res = mockRes();

    await optionalAuth(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------
describe('requireRole', () => {
  it('calls next() when user has the required role', () => {
    const middleware = requireRole(['admin']);
    const req = mockReq({ user: { role: 'admin' } });
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when req.user is not set', () => {
    const middleware = requireRole(['admin']);
    const req = mockReq();
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Authentication required' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 403 with requiredRoles and userRole when user role is not in allowed roles', () => {
    const middleware = requireRole(['admin']);
    const req = mockReq({ user: { role: 'user' } });
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Insufficient permissions',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('works with multiple allowed roles', () => {
    const middleware = requireRole(['admin', 'moderator']);

    // Admin should pass
    const reqAdmin = mockReq({ user: { role: 'admin' } });
    const resAdmin = mockRes();
    middleware(reqAdmin, resAdmin, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    mockNext.mockClear();

    // Moderator should pass
    const reqMod = mockReq({ user: { role: 'moderator' } });
    const resMod = mockRes();
    middleware(reqMod, resMod, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    mockNext.mockClear();

    // Regular user should fail
    const reqUser = mockReq({ user: { role: 'user' } });
    const resUser = mockRes();
    middleware(reqUser, resUser, mockNext);
    expect(resUser.status).toHaveBeenCalledWith(403);
    expect(resUser.json).toHaveBeenCalledWith({
      message: 'Insufficient permissions',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns a function (middleware factory pattern)', () => {
    const middleware = requireRole(['admin']);
    expect(typeof middleware).toBe('function');
  });
});
