const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const jobRoutes = require('./routes/jobs');
const noteRoutes = require('./routes/notes');
const searchRoutes = require('./routes/searches');
const userRoutes = require('./routes/users');

const app = express();

// Security middleware — configure CSP for Mapbox GL JS
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
        fontSrc: ["'self'", 'fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', '*.mapbox.com'],
        connectSrc: ["'self'", 'api.mapbox.com', 'events.mapbox.com', '*.tiles.mapbox.com'],
        workerSrc: ["'self'", 'blob:'],
        childSrc: ["'self'", 'blob:'],
      },
    },
  })
);

// Trust proxy for rate limiting (only trust localhost for development)
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : 'loopback');

// Rate limiting - more generous for development
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max:
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) ||
    (process.env.NODE_ENV === 'development' ? 1000 : 500), // 1000 for dev, 500 for prod
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
// Scope to /api only — static assets (JS/CSS chunks, images, index.html) must
// not count against the quota, or a handful of SPA loads exhausts it.
app.use('/api', limiter);

// CORS configuration
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean)
        : ['http://localhost:3000'],
    credentials: true,
  })
);

// Body parsing middleware with proper encoding
// (largest legitimate payload is a 5000-char note — 1mb is generous headroom)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Stricter rate limiting for credential attempts (disabled in test to avoid flaky tests).
// Applies ONLY to POST /login and /register — GET /me runs on every app load to
// restore the session and must not be starved by this limiter.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 20,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
const credentialLimiter = (req, res, next) => {
  if (req.method === 'POST' && (req.path === '/login' || req.path === '/register')) {
    return authLimiter(req, res, next);
  }
  next();
};

// API Routes
app.use('/api/auth', credentialLimiter, authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/searches', searchRoutes);
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'NYC Jobs API is running' });
});

// Rate limit status endpoint
app.get('/api/rate-limit-status', (req, res) => {
  const rateLimitInfo = {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || (process.env.NODE_ENV === 'development' ? 1000 : 500),
    environment: process.env.NODE_ENV || 'development',
    message: 'Check RateLimit-* headers in API responses for current usage',
  };
  res.json(rateLimitInfo);
});

// Serve static files and catchall only when not testing
if (process.env.NODE_ENV !== 'test') {
  // Serve static files from the React app
  app.use(express.static(path.join(__dirname, '../client/build')));

  // The "catchall" handler: for any non-API request that doesn't
  // match one above, send back React's index.html file.
  app.get(/^(?!\/api\/).*$/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Error handling middleware (must be after all route handlers)
app.use((err, req, res, next) => {
  console.error(err.stack);
  // Respect the error's own status (body-parser SyntaxError = 400, payload
  // too large = 413, …) — client errors must not be reported as server faults.
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    message: status >= 500 ? 'Something went wrong!' : err.message || 'Request error',
    error:
      process.env.NODE_ENV === 'development'
        ? err.message
        : status >= 500 ? 'Internal server error' : undefined,
  });
});

module.exports = app;
