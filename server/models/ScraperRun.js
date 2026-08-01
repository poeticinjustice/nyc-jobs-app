const mongoose = require('mongoose');
const { JOB_SOURCES } = require('../../shared/constants');

/**
 * One document per (refresh run, source). Powers the admin scraper-health
 * view: per-source history, durations, and flatline detection.
 */
const scraperRunSchema = new mongoose.Schema(
  {
    // Shared across every source in the same refresh cycle
    runId: {
      type: String,
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: [...JOB_SOURCES, 'mta'],
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    finishedAt: {
      type: Date,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    upserted: {
      type: Number,
      default: 0,
    },
    modified: {
      type: Number,
      default: 0,
    },
    // Jobs stored for this source after the run — the trend line that matters
    storedAfter: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['ok', 'empty', 'partial', 'failed'],
      default: 'ok',
    },
    error: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

scraperRunSchema.index({ source: 1, startedAt: -1 });
scraperRunSchema.index({ startedAt: -1 });
// Keep 90 days of history; runs are diagnostic, not user data
scraperRunSchema.index({ startedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('ScraperRun', scraperRunSchema);
