/**
 * Refresh script — orchestrates all job scrapers and cleans up stale jobs.
 *
 * Usage:
 *   node server/scripts/refreshJobs.js          # one-shot run
 *   Programmatic: require('./refreshJobs').refreshAllJobs()
 */

const Job = require('../models/Job');

// Import all scrapers
const refreshNycJobs = require('../scrapers/nyc');
const refreshFederalJobs = require('../scrapers/federal');
const refreshNysJobs = require('../scrapers/nys');
const refreshCunyJobs = require('../scrapers/cuny');
const refreshNyuJobs = require('../scrapers/nyu');
const refreshFordhamJobs = require('../scrapers/fordham');
const refreshPortAuthorityJobs = require('../scrapers/portauthority');
const refreshMountSinaiJobs = require('../scrapers/mountsinai');
const refreshIdealistJobs = require('../scrapers/idealist');
const refreshColumbiaJobs = require('../scrapers/columbia');
const refreshNypJobs = require('../scrapers/nyp');
const refreshNorthwellJobs = require('../scrapers/northwell');
const refreshNyuLangoneJobs = require('../scrapers/nyulangone');
const refreshNewSchoolJobs = require('../scrapers/newschool');
const refreshAmtrakJobs = require('../scrapers/amtrak');
const refreshUnJobs = require('../scrapers/un');
const refreshAmnhJobs = require('../scrapers/amnh');
const refreshMetMuseumJobs = require('../scrapers/metmuseum');
const refreshFrickJobs = require('../scrapers/frick');
const refreshGuggenheimJobs = require('../scrapers/guggenheim');

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

const cleanupStaleJobs = async (timestamp, counts) => {
  // Safety: only clean up a source if we actually fetched a meaningful number of jobs.
  // If an API returned 0 (e.g. outage), don't purge that source's jobs.
  const thresholds = {
    nyc: 100, federal: 10, nys: 50, cuny: 10, nyu: 10, fordham: 5, pa: 3,
    mountsinai: 50, idealist: 50, columbia: 20, nyp: 20, northwell: 50,
    nyulangone: 50, newschool: 5, amtrak: 3, un: 10, amnh: 5, metmuseum: 3,
    frick: 3, guggenheim: 3,
  };

  const sourceFilter = Object.entries(thresholds)
    .filter(([src, min]) => (counts[src] || 0) > min)
    .map(([src]) => src);

  if (sourceFilter.length === 0) {
    console.log('[refresh] Skipping cleanup — insufficient data from APIs');
    return 0;
  }

  const { JOB_SOURCES: validSources } = require('../../shared/constants');
  const result = await Job.deleteMany({
    $or: [
      // Stale jobs from sources we successfully refreshed
      {
        source: { $in: sourceFilter },
        lastRefreshedAt: { $lt: timestamp },
        $or: [
          { savedBy: { $size: 0 } },
          { savedBy: { $exists: false } },
        ],
      },
      // Jobs with invalid/legacy sources (always remove)
      {
        source: { $nin: validSources },
        $or: [
          { savedBy: { $size: 0 } },
          { savedBy: { $exists: false } },
        ],
      },
    ],
  });
  console.log(`[refresh] Cleaned up ${result.deletedCount} stale jobs (sources refreshed: ${sourceFilter.join(', ')})`);
  return result.deletedCount;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const refreshAllJobs = async () => {
  const timestamp = new Date();
  console.log(`[refresh] Starting job refresh at ${timestamp.toISOString()}`);

  const nyc = await refreshNycJobs(timestamp);
  const federal = await refreshFederalJobs(timestamp);
  const nys = await refreshNysJobs(timestamp);
  const cuny = await refreshCunyJobs(timestamp);
  const nyu = await refreshNyuJobs(timestamp);
  const fordham = await refreshFordhamJobs(timestamp);
  const pa = await refreshPortAuthorityJobs(timestamp);
  const mountsinai = await refreshMountSinaiJobs(timestamp);
  const idealist = await refreshIdealistJobs(timestamp);
  const columbia = await refreshColumbiaJobs(timestamp);
  const nyp = await refreshNypJobs(timestamp);
  const northwell = await refreshNorthwellJobs(timestamp);
  const nyulangone = await refreshNyuLangoneJobs(timestamp);
  const newschool = await refreshNewSchoolJobs(timestamp);
  const amtrak = await refreshAmtrakJobs(timestamp);
  const un = await refreshUnJobs(timestamp);
  const amnh = await refreshAmnhJobs(timestamp);
  const metmuseum = await refreshMetMuseumJobs(timestamp);
  const frick = await refreshFrickJobs(timestamp);
  const guggenheim = await refreshGuggenheimJobs(timestamp);

  const results = { nyc, federal, nys, cuny, nyu, fordham, pa, mountsinai, idealist, columbia, nyp, northwell, nyulangone, newschool, amtrak, un, amnh, metmuseum, frick, guggenheim };

  const counts = {};
  for (const [src, r] of Object.entries(results)) {
    counts[src] = r.upserted + r.modified;
  }

  const staleCount = await cleanupStaleJobs(timestamp, counts);
  const totalJobs = await Job.estimatedDocumentCount();
  console.log(`[refresh] Done. DB now has ~${totalJobs} jobs. Stale removed: ${staleCount}`);

  return { ...results, staleCount, totalJobs };
};

// Run standalone
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
  const mongoose = require('mongoose');

  (async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB');
      await refreshAllJobs();
    } catch (err) {
      console.error('Refresh failed:', err);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
  })();
}

module.exports = { refreshAllJobs };
