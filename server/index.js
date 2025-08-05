const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const noteRoutes = require('./routes/notes');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 8000;

// Security middleware
app.use(helmet());

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
app.use(limiter);

// CORS configuration
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? ['https://your-production-domain.com']
        : ['http://localhost:3000'],
    credentials: true,
  })
);

// Body parsing middleware with proper encoding
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Set proper content type and encoding headers for API routes only
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'NYC Jobs API is running' });
});

// Rate limit status endpoint
app.get('/api/rate-limit-status', (req, res) => {
  const rateLimitInfo = {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    maxRequests: process.env.NODE_ENV === 'development' ? 1000 : 500,
    environment: process.env.NODE_ENV || 'development',
    message: 'Check RateLimit-* headers in API responses for current usage',
  };
  res.json(rateLimitInfo);
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/build')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error:
      process.env.NODE_ENV === 'development'
        ? err.message
        : 'Internal server error',
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
