const mongoose = require('mongoose');
const cron = require('node-cron');
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'NYC_JOBS_API_URL'];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const optionalEnvVars = ['USAJOBS_API_KEY', 'USAJOBS_EMAIL', 'USAJOBS_BASE_URL'];
const missingOptional = optionalEnvVars.filter((key) => !process.env[key]);
if (missingOptional.length > 0) {
  console.warn(`Missing optional environment variables (federal jobs will be unavailable): ${missingOptional.join(', ')}`);
}

const app = require('./app');
const Job = require('./models/Job');
const { refreshAllJobs } = require('./scripts/refreshJobs');

const PORT = process.env.PORT || 8000;

// Start server only after MongoDB connects
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');

    // Seed on startup if database is empty
    const count = await Job.estimatedDocumentCount();
    if (count === 0) {
      console.log('Database is empty — triggering initial seed...');
      refreshAllJobs().catch((err) => console.error('Initial seed failed:', err));
    } else {
      console.log(`Database has ~${count} jobs`);
    }

    // Schedule refresh every 6 hours
    cron.schedule('0 0,6,12,18 * * *', () => {
      console.log('Cron: starting scheduled job refresh');
      refreshAllJobs().catch((err) => console.error('Scheduled refresh failed:', err));
    });

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Graceful shutdown with timeout
    const shutdown = (signal) => {
      console.log(`${signal} received. Shutting down gracefully...`);
      const forceExit = setTimeout(() => {
        console.error('Shutdown timed out, forcing exit.');
        process.exit(1);
      }, 10000);
      server.close(() => {
        mongoose.connection.close(false).then(() => {
          clearTimeout(forceExit);
          console.log('MongoDB connection closed.');
          process.exit(0);
        });
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
