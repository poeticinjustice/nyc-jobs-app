/**
 * Refresh script — orchestrates all job scrapers and cleans up stale jobs.
 *
 * Usage:
 *   node server/scripts/refreshJobs.js          # one-shot run
 *   Programmatic: require('./refreshJobs').refreshAllJobs()
 */

const Job = require('../models/Job');
const ScraperRun = require('../models/ScraperRun');
const { runSavedSearchAlerts } = require('../helpers/savedSearchAlerts');

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
const refreshMskJobs = require('../scrapers/msk');
const refreshMontefioreJobs = require('../scrapers/montefiore');
const refreshNyplJobs = require('../scrapers/nypl');
const refreshNychhcJobs = require('../scrapers/nychhc');

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

const cleanupStaleJobs = async (timestamp, counts) => {
  // Safety: only clean up a source if we actually fetched a meaningful number of jobs.
  // If an API returned 0 (e.g. outage), don't purge that source's jobs.
  // Small sources (museums etc.) get a threshold of 1 — their normal inventory
  // can be at or below a larger threshold, which would mean filled positions
  // are never purged and stay listed forever.
  const thresholds = {
    nyc: 100, federal: 10, nys: 50, cuny: 10, nyu: 10, fordham: 5, pa: 3,
    mountsinai: 50, idealist: 50, columbia: 20, nyp: 20, northwell: 20,
    nyulangone: 50, newschool: 5, amtrak: 1, un: 10, amnh: 2, metmuseum: 1,
    frick: 1, guggenheim: 1, msk: 10, montefiore: 20, nypl: 1, nychhc: 10,
  };

  // Current stored count per source, to detect partial fetches: a scraper that
  // errors mid-pagination reports its partial list as success, and without this
  // guard everything beyond the failure point would be purged as stale.
  const storedCounts = {};
  const grouped = await Job.aggregate([{ $group: { _id: '$source', n: { $sum: 1 } } }]);
  for (const g of grouped) storedCounts[g._id] = g.n;

  const sourceFilter = [];
  const partialSkipped = [];
  for (const [src, min] of Object.entries(thresholds)) {
    const fetched = counts[src] || 0;
    if (fetched < min) continue; // not enough evidence the source responded
    const stored = storedCounts[src] || 0;
    if (stored >= 10 && fetched < stored * 0.5) {
      partialSkipped.push(`${src} (${fetched}/${stored})`);
      continue;
    }
    sourceFilter.push(src);
  }

  if (partialSkipped.length > 0) {
    console.warn(`[refresh] Cleanup skipped for possibly-partial fetches: ${partialSkipped.join(', ')}`);
  }
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

const DEFAULT_SCRAPERS = [
  { source: 'nyc', fn: refreshNycJobs },
  { source: 'federal', fn: refreshFederalJobs },
  { source: 'nys', fn: refreshNysJobs },
  { source: 'cuny', fn: refreshCunyJobs },
  { source: 'nyu', fn: refreshNyuJobs },
  { source: 'fordham', fn: refreshFordhamJobs },
  { source: 'pa', fn: refreshPortAuthorityJobs },
  { source: 'mountsinai', fn: refreshMountSinaiJobs },
  { source: 'idealist', fn: refreshIdealistJobs },
  { source: 'columbia', fn: refreshColumbiaJobs },
  { source: 'nyp', fn: refreshNypJobs },
  { source: 'northwell', fn: refreshNorthwellJobs },
  { source: 'nyulangone', fn: refreshNyuLangoneJobs },
  { source: 'newschool', fn: refreshNewSchoolJobs },
  { source: 'amtrak', fn: refreshAmtrakJobs },
  { source: 'un', fn: refreshUnJobs },
  { source: 'amnh', fn: refreshAmnhJobs },
  { source: 'metmuseum', fn: refreshMetMuseumJobs },
  { source: 'frick', fn: refreshFrickJobs },
  { source: 'guggenheim', fn: refreshGuggenheimJobs },
  { source: 'msk', fn: refreshMskJobs },
  { source: 'montefiore', fn: refreshMontefioreJobs },
  { source: 'nypl', fn: refreshNyplJobs },
  { source: 'nychhc', fn: refreshNychhcJobs },
];

// One scraper must not be able to hold up the whole run. Columbia honours a
// 5.5s robots.txt crawl delay serially, so a cold start legitimately takes
// about an hour; this caps the worst case rather than the normal one. A capped
// scraper reports 0 fetched, which makes cleanupStaleJobs skip its source —
// so timing out is safe, it just leaves that source unrefreshed this cycle.
const SCRAPER_TIMEOUT_MS = parseInt(process.env.SCRAPER_TIMEOUT_MS, 10) || 90 * 60 * 1000;

// Timing out does not cancel the scraper — it keeps running to completion in
// the background. Promise.race subscribes to it, so a late rejection is already
// handled; the cost is just wasted work until it finishes.
const withTimeout = (promise, ms, source) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Scraper "${source}" exceeded ${Math.round(ms / 1000)}s`)),
        ms
      );
      // Don't hold the event loop open on the one-shot CLI path.
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
};

/**
 * Run every scraper, then clean up stale jobs and record run metrics.
 *
 * `scrapers` is injectable so the pipeline itself can be tested without
 * hitting the network; it defaults to the full production list.
 */
const refreshAllJobs = async ({ scrapers = DEFAULT_SCRAPERS, timeoutMs = SCRAPER_TIMEOUT_MS } = {}) => {
  const timestamp = new Date();
  console.log(`[refresh] Starting job refresh at ${timestamp.toISOString()}`);

  const BATCH_SIZE = 5;
  const results = {};
  const counts = {};
  const metrics = [];
  const runId = `${timestamp.toISOString()}-${Math.round(timestamp.getTime() % 100000)}`;

  for (let i = 0; i < scrapers.length; i += BATCH_SIZE) {
    const batch = scrapers.slice(i, i + BATCH_SIZE);
    const batchNames = batch.map((s) => s.source).join(', ');
    console.log(`[refresh] Running batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchNames}`);

    // Time each scraper from its own start to its own finish. Reading the clock
    // in the results loop instead — after the whole batch had settled — made
    // every source in a batch report the slowest one's duration.
    const settled = await Promise.all(
      batch.map(async (s) => {
        const startedAt = new Date();
        try {
          const value = await withTimeout(s.fn(timestamp), timeoutMs, s.source);
          return { ok: true, value, startedAt, finishedAt: new Date() };
        } catch (error) {
          return { ok: false, error, startedAt, finishedAt: new Date() };
        }
      })
    );

    for (let j = 0; j < batch.length; j++) {
      const { source } = batch[j];
      const outcome = settled[j];
      const metric = {
        runId,
        source,
        startedAt: outcome.startedAt,
        finishedAt: outcome.finishedAt,
        durationMs: outcome.finishedAt - outcome.startedAt,
      };

      if (outcome.ok) {
        const r = outcome.value;
        results[source] = r;
        counts[source] = r.upserted + r.modified;
        metric.upserted = r.upserted;
        metric.modified = r.modified;
        metric.status = counts[source] === 0 ? 'empty' : 'ok';
      } else {
        console.error(`[refresh] Scraper "${source}" failed:`, outcome.error);
        results[source] = { upserted: 0, modified: 0 };
        counts[source] = 0;
        metric.status = 'failed';
        metric.error = String(outcome.error?.message || outcome.error).slice(0, 500);
      }
      metrics.push(metric);
    }
  }

  const staleCount = await cleanupStaleJobs(timestamp, counts);
  const totalJobs = await Job.estimatedDocumentCount();

  // Persist per-source metrics for the admin scraper-health view
  try {
    const storedBySource = Object.fromEntries(
      (await Job.aggregate([{ $group: { _id: '$source', n: { $sum: 1 } } }]))
        .map((g) => [g._id, g.n])
    );
    for (const m of metrics) {
      m.storedAfter = storedBySource[m.source] || 0;
      // A run that refreshed far less than what's stored looks partial —
      // the same signal cleanupStaleJobs uses to refuse purging.
      if (m.status === 'ok' && m.storedAfter >= 10 &&
          (m.upserted + m.modified) < m.storedAfter * 0.5) {
        m.status = 'partial';
      }
    }
    if (metrics.length) await ScraperRun.insertMany(metrics, { ordered: false });
  } catch (err) {
    console.error('[refresh] Failed to record scraper metrics:', err.message);
  }

  console.log(`[refresh] Done. DB now has ~${totalJobs} jobs. Stale removed: ${staleCount}`);

  // Notify users whose saved searches have new matches
  try {
    await runSavedSearchAlerts();
  } catch (err) {
    console.error('[refresh] Saved-search alerts failed:', err.message);
  }

  return { ...results, staleCount, totalJobs, runId };
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

module.exports = { refreshAllJobs, cleanupStaleJobs };
