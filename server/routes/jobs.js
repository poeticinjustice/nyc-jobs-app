const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { body, query, validationResult } = require('express-validator');
const Job = require('../models/Job');
const Note = require('../models/Note');
const User = require('../models/User');
const ScraperRun = require('../models/ScraperRun');
const { authenticateToken, optionalAuth, requireRole } = require('../middleware/auth');
const {
  getUserSaveEntry,
  escCsv,
  escapeRegex,
  buildSearchFilter,
  buildSort,
} = require('../helpers/jobHelpers');
const {
  JOB_SOURCES,
  VALID_SOURCE_FILTERS,
  APPLICATION_STATUS_VALUES,
  SORT_VALUES,
  DOC_LINK_MAX,
  DOC_LABEL_MAX,
} = require('../../shared/constants');

const router = express.Router();

const SEARCH_EXPORT_LIMIT = 5000;
const MAP_FEATURE_LIMIT = 5000;
const BULK_STATUS_MAX = 100;
const SCRAPER_HISTORY_LIMIT = 200;

// --- Helpers ---

// Validate and default job source from request body or query
const getSource = (req) => {
  const raw = req.body.source || req.query.source;
  return JOB_SOURCES.includes(raw) ? raw : 'nyc';
};

// Build query filter for a user's saved jobs, optionally filtered by status
const buildSavedJobsFilter = (userId, status) =>
  status
    ? { savedBy: { $elemMatch: { user: userId, applicationStatus: status } } }
    : { 'savedBy.user': userId };

// --- Map rate limiting ---

const mapRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'test' ? 10000 : 30,
  message: 'Too many map requests, please try again shortly.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Longer-window map limiter, per IP.
 *
 * This used to be a single process-global counter: the per-IP minute limiter
 * allows 30 req/min = 43,200 a day, which is 1.7x what was a *global* monthly
 * budget of 25,000. One client looping the endpoint could therefore 429 the map
 * for every other user — web and mobile — for the rest of the calendar month,
 * with no way to reset it short of a redeploy.
 *
 * It also guarded nothing it was described as guarding: this route reads
 * pre-geocoded coordinates out of Mongo and never calls Mapbox. Mapbox tile
 * billing is driven by the browser loading tiles, not by this endpoint. So the
 * cap exists purely to stop one client hammering the database, which is a
 * per-client concern — hence a per-IP window rather than a shared pool.
 */
const mapDailyLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 100000 : 2000,
  message: 'Daily map request limit reached. Please try again tomorrow.',
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Simple TTL cache for categories/agencies ---
const cache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const getCached = async (key, fetchFn) => {
  const now = Date.now();
  if (cache[key] && now - cache[key].time < CACHE_TTL) {
    return cache[key].data;
  }
  const data = await fetchFn();
  cache[key] = { data, time: now };
  return data;
};

// --- Routes ---

// Map data — returns GeoJSON FeatureCollection from pre-geocoded jobs
router.get(
  '/map',
  [
    mapRateLimit,
    mapDailyLimit,
    query('source').optional().isIn(VALID_SOURCE_FILTERS),
    query('keyword').optional().isString().trim(),
    query('salary_min').optional().custom((v) => v === '' || !isNaN(v)).withMessage('salary_min must be a number'),
    query('salary_max').optional().custom((v) => v === '' || !isNaN(v)).withMessage('salary_max must be a number'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const {
        source = 'all',
        keyword = '',
        salary_min,
        salary_max,
      } = req.query;

      // Build filter: only jobs with coordinates
      const filter = buildSearchFilter({
        q: keyword || undefined,
        salary_min,
        salary_max,
        source,
      });
      filter['coordinates.lat'] = { $ne: null };
      filter['coordinates.lng'] = { $ne: null };

      const jobs = await Job.find(filter)
        .select('jobId businessTitle agency workLocation salaryRangeFrom salaryRangeTo salaryFrequency source postDate jobCategory coordinates')
        .sort({ postDate: -1 })
        .limit(MAP_FEATURE_LIMIT)
        .lean();

      const features = jobs.map((job) => {
        // Add jitter at read time so stacked markers spread out
        const lat = job.coordinates.lat + (Math.random() - 0.5) * 0.01;
        const lng = job.coordinates.lng + (Math.random() - 0.5) * 0.01;
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            jobId: job.jobId,
            businessTitle: job.businessTitle,
            agency: job.agency,
            workLocation: job.workLocation,
            salaryRangeFrom: job.salaryRangeFrom,
            salaryRangeTo: job.salaryRangeTo,
            salaryFrequency: job.salaryFrequency,
            source: job.source,
            postDate: job.postDate,
            jobCategory: job.jobCategory,
          },
        };
      });

      res.json({
        type: 'FeatureCollection',
        features,
        // The filter already requires coordinates, so every feature here is
        // geocoded by construction — reporting both numbers implied a
        // difference that cannot exist. `truncated` is the useful signal:
        // the query caps at MAP_FEATURE_LIMIT, and the client had no way to
        // know it was looking at a partial map.
        metadata: { total: features.length, truncated: features.length === MAP_FEATURE_LIMIT },
      });
    } catch (error) {
      console.error('Map data error:', error);
      res.status(500).json({ message: 'Error fetching map data' });
    }
  }
);

/**
 * Readiness check — render.yaml points healthCheckPath here, and it is the
 * endpoint an uptime monitor should watch.
 *
 * It must FAIL when the database is unreachable. It previously answered
 * 200 {status:'ok'} from the catch block, so a total Atlas outage looked
 * healthy: Render kept the dead instance in rotation and never restarted it
 * while every real route was returning 500.
 *
 * readyState is checked before touching the database on purpose. With the
 * connection down, a query buffers until it times out (~30s observed), which
 * is long enough to blow the health-check deadline and cause flapping.
 * The liveness counterpart, which deliberately touches nothing, is /api/health.
 */
router.get('/health', async (req, res) => {
  // 1 === connected; 0 disconnected, 2 connecting, 3 disconnecting
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      status: 'unavailable',
      database: 'disconnected',
    });
  }

  try {
    const count = await Job.estimatedDocumentCount();
    res.json({ status: 'ok', database: 'connected', jobsInDatabase: count });
  } catch (error) {
    console.error('Health check query failed:', error.message);
    res.status(503).json({ status: 'unavailable', database: 'error' });
  }
});

// Search jobs
router.get(
  '/search',
  [
    optionalAuth,
    // isString first: a repeated param (?q=a&q=b) or ?category[]=a arrives as
    // an array, which reaches escapeRegex/$text and 500s. Reject it as a 400.
    query('q').optional().isString().trim(),
    query('category').optional().isString().trim(),
    query('location').optional().isString().trim(),
    query('agency').optional().isString().trim(),
    query('salary_min')
      .optional()
      .custom((value) => {
        if (value === '' || value === undefined || value === null) return true;
        return !isNaN(value) && Number.isInteger(Number(value));
      })
      .withMessage('salary_min must be a number'),
    query('salary_max')
      .optional()
      .custom((value) => {
        if (value === '' || value === undefined || value === null) return true;
        return !isNaN(value) && Number.isInteger(Number(value));
      })
      .withMessage('salary_max must be a number'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sort')
      .optional()
      .isIn(SORT_VALUES),
    query('source').optional().custom((value) => {
      if (!value) return true;
      return value.split(',').every((s) => VALID_SOURCE_FILTERS.includes(s));
    }).withMessage('source must be "all" or valid source names'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const {
        q = '',
        category = '',
        location = '',
        agency = '',
        salary_min,
        salary_max,
        page = 1,
        limit = 20,
        sort = 'date_desc',
        source = 'all',
      } = req.query;

      const pageNum = parseInt(page) || 1;
      const limitNum = Math.min(parseInt(limit) || 20, 100);

      const filter = buildSearchFilter({
        q: q || undefined,
        category: category || undefined,
        location: location || undefined,
        agency: agency || undefined,
        salary_min,
        salary_max,
        source,
      });

      const mongoSort = buildSort(sort);
      // When using $text search, add text score for relevance
      const projection = q ? { score: { $meta: 'textScore' } } : {};
      const finalSort = q ? { score: { $meta: 'textScore' }, ...mongoSort } : mongoSort;

      const [total, jobs] = await Promise.all([
        Job.countDocuments(filter),
        Job.find(filter, projection)
          .sort(finalSort)
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
      ]);

      // Check saved status for authenticated users — the fetched docs already
      // carry savedBy, so no second query is needed. isNew marks jobs added to
      // the database since the user last called POST /api/jobs/seen.
      let jobsWithStatus = jobs;
      let newSinceLastSeen = 0;
      if (req.user) {
        const uid = req.user._id.toString();
        const seenAt = req.user.lastJobsSeenAt;
        jobsWithStatus = jobs.map((job) => {
          const isNew = Boolean(seenAt && job.createdAt && job.createdAt > seenAt);
          if (isNew) newSinceLastSeen++;
          return {
            ...job,
            isSaved: (job.savedBy || []).some((s) => s.user && s.user.toString() === uid),
            isNew,
          };
        });
      }

      // Strip savedBy from response
      const sanitized = jobsWithStatus.map(({ savedBy, __v, score, ...rest }) => rest);

      res.json({
        jobs: sanitized,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
        source,
        // How many jobs on THIS page are new since the user last looked
        newSinceLastSeen,
        lastJobsSeenAt: req.user ? req.user.lastJobsSeenAt : null,
      });
    } catch (error) {
      console.error('Job search error:', error);
      res.status(500).json({ message: 'Error searching jobs' });
    }
  }
);

// Get job categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await getCached('categories', () => Job.distinct('jobCategory', { jobCategory: { $ne: null }, source: { $in: JOB_SOURCES } }));
    res.json({ categories: categories.sort() });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Error fetching categories' });
  }
});

// Get agencies list
router.get('/agencies', async (req, res) => {
  try {
    const agencies = await getCached('agencies', () => Job.distinct('agency', { agency: { $ne: null }, source: { $in: JOB_SOURCES } }));
    res.json({ agencies: agencies.sort() });
  } catch (error) {
    console.error('Get agencies error:', error);
    res.status(500).json({ message: 'Error fetching agencies' });
  }
});

// Sort options for the saved-jobs list. updated_desc/saved_desc are sorted on
// the requesting user's OWN savedBy entry (via aggregation) — the job document's
// updatedAt is bumped by every scraper refresh and by other users saving the
// same job, which made "recently saved" lists reorder at random.
const SAVED_SORTS = {
  updated_desc: 'entry',
  saved_desc: 'entry',
  date_desc: { postDate: -1 },
  date_asc: { postDate: 1 },
  title_asc: { businessTitle: 1 },
  title_desc: { businessTitle: -1 },
  salary_desc: { salaryRangeFrom: -1 },
  salary_asc: { salaryRangeFrom: 1 },
};

// Get saved jobs
router.get('/saved', [
  authenticateToken,
  query('status').optional().isIn(APPLICATION_STATUS_VALUES),
  query('sort').optional().custom((v) => Object.hasOwn(SAVED_SORTS, v)),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { page = 1, limit = 20, status, sort = 'updated_desc' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);

    const queryFilter = buildSavedJobsFilter(req.user._id, status);

    const sortSpec = Object.hasOwn(SAVED_SORTS, sort) ? SAVED_SORTS[sort] : 'entry';

    const total = await Job.countDocuments(queryFilter);

    let jobs;
    if (sortSpec === 'entry') {
      jobs = await Job.aggregate([
        { $match: queryFilter },
        {
          $addFields: {
            _userEntry: {
              $arrayElemAt: [
                { $filter: { input: '$savedBy', cond: { $eq: ['$$this.user', req.user._id] } } },
                0,
              ],
            },
          },
        },
        { $sort: { '_userEntry.savedAt': -1, _id: 1 } },
        { $skip: (pageNum - 1) * limitNum },
        { $limit: limitNum },
        { $unset: '_userEntry' },
      ]);
    } else {
      jobs = await Job.find(queryFilter)
        .sort({ ...sortSpec, _id: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean();
    }

    // Fetch note counts for the returned jobs in one query
    const jobIds = jobs.map((j) => j.jobId);
    const noteCounts = await Note.aggregate([
      { $match: { user: req.user._id, status: 'active', jobId: { $in: jobIds } } },
      { $group: { _id: '$jobId', count: { $sum: 1 } } },
    ]);
    const noteCountMap = Object.fromEntries(noteCounts.map((n) => [n._id, n.count]));

    // savedBy holds EVERY user's private tracking data — statuses, interview
    // dates, document links. Strip it and hand the requester only their own
    // entry, the same way /search, /admin and /:id already do.
    const jobsWithStatus = jobs.map(({ savedBy, __v, ...job }) => ({
      ...job,
      ...getUserSaveEntry({ savedBy }, req.user._id),
      noteCount: noteCountMap[job.jobId] || 0,
    }));

    res.json({
      jobs: jobsWithStatus,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get saved jobs error:', error);
    res.status(500).json({ message: 'Error fetching saved jobs' });
  }
});

// Export saved jobs as CSV
router.get('/saved/export', [
  authenticateToken,
  query('status').optional().isIn(APPLICATION_STATUS_VALUES),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }
    const { status } = req.query;
    const queryFilter = buildSavedJobsFilter(req.user._id, status);

    const jobs = await Job.find(queryFilter)
      .select('jobId source businessTitle agency jobCategory workLocation salaryRangeFrom salaryRangeTo salaryFrequency fullTimePartTimeIndicator level postDate savedBy')
      .sort({ updatedAt: -1 })
      .limit(5000)
      .lean();

    const headers = [
      'Job ID',
      'Source',
      'Title',
      'Agency',
      'Category',
      'Location',
      'Salary From',
      'Salary To',
      'Salary Frequency',
      'Full/Part Time',
      'Level',
      'Post Date',
      'Application Status',
      'Saved At',
      'Application Date',
      'Interview Date',
      'Follow-Up Date',
      'Document Links',
    ];

    const fmtDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');
    const fmtLinks = (links) =>
      (links || []).map((l) => `${l.label}: ${l.url}`).join('; ');

    const rows = jobs.map((job) => {
      const entry = getUserSaveEntry(job, req.user._id);
      return [
        job.jobId,
        job.source || 'nyc',
        job.businessTitle,
        job.agency,
        job.jobCategory,
        job.workLocation,
        job.salaryRangeFrom,
        job.salaryRangeTo,
        job.salaryFrequency,
        job.fullTimePartTimeIndicator,
        job.level,
        fmtDate(job.postDate),
        entry.applicationStatus || 'interested',
        fmtDate(entry.savedAt),
        fmtDate(entry.applicationDate),
        fmtDate(entry.interviewDate),
        fmtDate(entry.followUpDate),
        fmtLinks(entry.documentLinks),
      ]
        .map(escCsv)
        .join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="saved-jobs.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Export saved jobs error:', error);
    res.status(500).json({ message: 'Error exporting saved jobs' });
  }
});

// Admin: list all jobs with save counts
router.get(
  '/admin',
  [
    authenticateToken,
    requireRole(['admin']),
    query('q').optional().isString().trim(),
    query('source').optional().isIn(VALID_SOURCE_FILTERS),
    query('agency').optional().isString().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }
      const { page = 1, limit = 20, q, source, agency } = req.query;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(Math.max(1, parseInt(limit) || 20), 100);

      const filter = {};
      if (source && source !== 'all') filter.source = source;
      if (agency) filter.agency = new RegExp(escapeRegex(agency), 'i');
      if (q) filter.$text = { $search: q };

      const projection = q ? { score: { $meta: 'textScore' } } : {};
      const sortObj = q ? { score: { $meta: 'textScore' }, postDate: -1 } : { postDate: -1 };

      const [total, jobs] = await Promise.all([
        Job.countDocuments(filter),
        Job.find(filter, projection)
          .select('jobId source businessTitle agency workLocation salaryRangeFrom salaryRangeTo salaryFrequency postDate savedBy jobCategory')
          .sort(sortObj)
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
      ]);

      const result = jobs.map(({ savedBy, score, ...job }) => ({
        ...job,
        saveCount: savedBy?.length || 0,
      }));

      res.json({
        jobs: result,
        pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
      });
    } catch (error) {
      console.error('Admin job list error:', error);
      res.status(500).json({ message: 'Error fetching jobs' });
    }
  }
);

// Export search results as CSV (same filters as GET /search)
router.get(
  '/search/export',
  [
    optionalAuth,
    // isString first: a repeated param (?q=a&q=b) or ?category[]=a arrives as
    // an array, which reaches escapeRegex/$text and 500s. Reject it as a 400.
    query('q').optional().isString().trim(),
    query('category').optional().isString().trim(),
    query('location').optional().isString().trim(),
    query('agency').optional().isString().trim(),
    query('salary_min').optional().custom((v) => v === '' || !isNaN(v)),
    query('salary_max').optional().custom((v) => v === '' || !isNaN(v)),
    query('sort').optional().isIn(SORT_VALUES),
    query('source').optional().custom((value) => {
      if (!value) return true;
      return value.split(',').every((s) => VALID_SOURCE_FILTERS.includes(s));
    }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const { q, category, location, agency, salary_min, salary_max, sort = 'date_desc', source = 'all' } = req.query;

      const filter = buildSearchFilter({
        q: q || undefined,
        category: category || undefined,
        location: location || undefined,
        agency: agency || undefined,
        salary_min,
        salary_max,
        source,
      });

      const mongoSort = q
        ? { score: { $meta: 'textScore' }, ...buildSort(sort) }
        : buildSort(sort);

      const jobs = await Job.find(filter, q ? { score: { $meta: 'textScore' } } : {})
        .select('jobId source businessTitle agency jobCategory workLocation workLocation1 salaryRangeFrom salaryRangeTo salaryFrequency fullTimePartTimeIndicator level postDate postUntil externalUrl')
        .sort(mongoSort)
        .limit(SEARCH_EXPORT_LIMIT)
        .lean();

      const headers = [
        'Job ID', 'Source', 'Title', 'Agency', 'Category', 'Location',
        'Salary From', 'Salary To', 'Salary Frequency', 'Full/Part Time',
        'Level', 'Post Date', 'Closes', 'URL',
      ];
      const fmtDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');

      const rows = jobs.map((job) => [
        job.jobId,
        job.source || 'nyc',
        job.businessTitle,
        job.agency,
        job.jobCategory,
        job.workLocation1 || job.workLocation,
        job.salaryRangeFrom,
        job.salaryRangeTo,
        job.salaryFrequency,
        job.fullTimePartTimeIndicator,
        job.level,
        fmtDate(job.postDate),
        fmtDate(job.postUntil),
        job.externalUrl,
      ].map(escCsv).join(','));

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="job-search-results.csv"');
      res.send([headers.join(','), ...rows].join('\n'));
    } catch (error) {
      console.error('Export search results error:', error);
      res.status(500).json({ message: 'Error exporting search results' });
    }
  }
);

// Mark all currently-listed jobs as seen (resets "New" badges)
router.post('/seen', authenticateToken, async (req, res) => {
  try {
    const seenAt = new Date();
    await User.updateOne({ _id: req.user._id }, { $set: { lastJobsSeenAt: seenAt } });
    res.json({ message: 'Jobs marked as seen', lastJobsSeenAt: seenAt });
  } catch (error) {
    console.error('Mark jobs seen error:', error);
    res.status(500).json({ message: 'Error marking jobs as seen' });
  }
});

// Bulk application-status update for saved jobs
router.put(
  '/saved/bulk-status',
  [
    authenticateToken,
    body('status').isIn(APPLICATION_STATUS_VALUES),
    body('jobs').isArray({ min: 1, max: BULK_STATUS_MAX }).withMessage(`Provide 1-${BULK_STATUS_MAX} jobs`),
    body('jobs.*.jobId').isString().trim().notEmpty(),
    body('jobs.*.source').optional().isIn(JOB_SOURCES),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const { status, jobs } = req.body;
      const now = new Date();

      const ops = jobs.map(({ jobId, source }) => ({
        updateOne: {
          filter: {
            jobId,
            source: JOB_SOURCES.includes(source) ? source : 'nyc',
            'savedBy.user': req.user._id,
          },
          update: {
            $set: {
              'savedBy.$.applicationStatus': status,
              'savedBy.$.statusUpdatedAt': now,
            },
            $push: {
              'savedBy.$.statusHistory': {
                $each: [{ status, changedAt: now }],
                $slice: -50,
              },
            },
          },
        },
      }));

      const result = await Job.bulkWrite(ops, { ordered: false });
      const updated = result.modifiedCount || 0;

      res.json({
        message: `Updated ${updated} job${updated === 1 ? '' : 's'}`,
        status,
        updated,
        requested: jobs.length,
      });
    } catch (error) {
      console.error('Bulk status update error:', error);
      res.status(500).json({ message: 'Error updating application statuses' });
    }
  }
);

// Admin: scraper health — latest run per source plus recent history
router.get(
  '/admin/scraper-health',
  [authenticateToken, requireRole(['admin'])],
  async (req, res) => {
    try {
      // The baseline must come from runs that actually fetched something.
      // Failed and empty runs store upserted/modified as 0 (schema defaults),
      // so averaging over all of them drags the baseline toward zero — after a
      // stretch of failures it falls under the `avgFetched > 10` gate and the
      // drop check silently stops firing, exactly when a source limps back
      // degraded. $$REMOVE omits the value so $avg skips it entirely.
      const PRODUCTIVE = { $in: ['$status', ['ok', 'partial']] };
      const latest = await ScraperRun.aggregate([
        { $sort: { startedAt: -1 } },
        {
          $group: {
            _id: '$source',
            latest: { $first: '$$ROOT' },
            avgFetched: {
              $avg: { $cond: [PRODUCTIVE, { $add: ['$upserted', '$modified'] }, '$$REMOVE'] },
            },
            runs: { $sum: { $cond: [PRODUCTIVE, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const sources = latest.map(({ _id, latest: run, avgFetched, runs }) => {
        const fetched = (run.upserted || 0) + (run.modified || 0);
        // Flatline: nothing fetched, an outright failure, or a sharp drop
        // against this source's trailing average
        const flatlined =
          run.status === 'failed' ||
          run.status === 'empty' ||
          (runs > 2 && avgFetched > 10 && fetched < avgFetched * 0.25);

        return {
          source: _id,
          status: run.status,
          fetched,
          upserted: run.upserted || 0,
          modified: run.modified || 0,
          storedAfter: run.storedAfter || 0,
          durationMs: run.durationMs || 0,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          error: run.error || null,
          avgFetched: Math.round(avgFetched || 0),
          flatlined,
        };
      });

      // Sources that have never reported a run at all
      const seen = new Set(sources.map((s) => s.source));
      const missing = JOB_SOURCES.filter((s) => !seen.has(s));

      const history = await ScraperRun.find({})
        .select('runId source status upserted modified storedAfter durationMs startedAt')
        .sort({ startedAt: -1 })
        .limit(SCRAPER_HISTORY_LIMIT)
        .lean();

      res.json({
        sources,
        missing,
        history,
        summary: {
          total: sources.length,
          healthy: sources.filter((s) => !s.flatlined).length,
          flatlined: sources.filter((s) => s.flatlined).length,
          neverRan: missing.length,
        },
      });
    } catch (error) {
      console.error('Scraper health error:', error);
      res.status(500).json({ message: 'Error fetching scraper health' });
    }
  }
);

// Get job details
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    // getSource rejects non-string / unknown values (e.g. ?source[$ne]=x) and
    // defaults to 'nyc'
    const jobSource = getSource(req);

    const job = await Job.findOne({ jobId: id, source: jobSource }).lean();
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Check saved status
    let saveEntry = { isSaved: false, applicationStatus: null, statusHistory: [] };
    if (req.user) {
      saveEntry = getUserSaveEntry(job, req.user._id);
    }

    let noteCount = 0;
    if (req.user && saveEntry.isSaved) {
      noteCount = await Note.countDocuments({
        user: req.user._id,
        status: 'active',
        jobId: id,
      });
    }

    const { savedBy, __v, ...safeJobData } = job;
    res.json({ ...safeJobData, ...saveEntry, noteCount });
  } catch (error) {
    console.error('Get job details error:', error);
    res.status(500).json({ message: 'Error fetching job details' });
  }
});

// Save a job
router.post('/:id/save', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const source = getSource(req);
    const now = new Date();

    const newEntry = {
      user: req.user._id,
      savedAt: now,
      applicationStatus: 'interested',
      statusUpdatedAt: now,
      statusHistory: [{ status: 'interested', changedAt: now }],
    };

    // Atomic: only add if user hasn't already saved this job
    const result = await Job.findOneAndUpdate(
      { jobId: id, source, 'savedBy.user': { $ne: req.user._id } },
      { $push: { savedBy: newEntry } },
      { new: true }
    );

    if (!result) {
      // Either job doesn't exist or already saved
      const exists = await Job.exists({ jobId: id, source });
      if (!exists) {
        return res.status(404).json({ message: 'Job not found' });
      }
      return res.status(400).json({ message: 'Job already saved' });
    }

    const entry = getUserSaveEntry(result, req.user._id);
    const { savedBy: _sb, __v: _v, ...safeJob } = result.toObject();
    res.json({ message: 'Job saved successfully', jobId: id, source, ...entry, job: safeJob });
  } catch (error) {
    console.error('Error saving job:', error);
    res.status(500).json({ message: 'Failed to save job' });
  }
});

// Unsave a job
router.delete('/:id/save', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const source = getSource(req);

    // Atomic pull — no read-modify-write race
    const result = await Job.findOneAndUpdate(
      { jobId: id, source },
      { $pull: { savedBy: { user: req.user._id } } }
    );

    if (!result) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.json({ message: 'Job unsaved successfully' });
  } catch (error) {
    console.error('Unsave job error:', error);
    res.status(500).json({ message: 'Error unsaving job' });
  }
});

// Update tracking dates and document links
router.put(
  '/:id/tracking',
  [
    authenticateToken,
    body('applicationDate').optional({ nullable: true }).isISO8601().toDate(),
    body('interviewDate').optional({ nullable: true }).isISO8601().toDate(),
    body('followUpDate').optional({ nullable: true }).isISO8601().toDate(),
    body('documentLinks').optional().isArray({ max: DOC_LINK_MAX }),
    body('documentLinks.*.label').trim().isLength({ min: 1, max: DOC_LABEL_MAX }),
    body('documentLinks.*.url').trim().isURL({ protocols: ['http', 'https'] }),
    body('statusHistory').optional().isArray({ max: 50 }),
    body('statusHistory.*.status').isIn(APPLICATION_STATUS_VALUES),
    body('statusHistory.*.changedAt').isISO8601(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const { id } = req.params;
      const { applicationDate, interviewDate, followUpDate, documentLinks, statusHistory } = req.body;
      const source = getSource(req);

      // Build atomic $set for only the fields provided
      const setFields = {};
      if (applicationDate !== undefined) setFields['savedBy.$.applicationDate'] = applicationDate;
      if (interviewDate !== undefined) setFields['savedBy.$.interviewDate'] = interviewDate;
      if (followUpDate !== undefined) setFields['savedBy.$.followUpDate'] = followUpDate;
      if (documentLinks !== undefined) setFields['savedBy.$.documentLinks'] = documentLinks;
      if (statusHistory !== undefined) setFields['savedBy.$.statusHistory'] = statusHistory;

      if (Object.keys(setFields).length === 0) {
        return res.status(400).json({ message: 'No tracking fields provided' });
      }

      const job = await Job.findOneAndUpdate(
        { jobId: id, source, 'savedBy.user': req.user._id },
        { $set: setFields },
        { new: true }
      );

      if (!job) {
        const exists = await Job.exists({ jobId: id, source });
        if (!exists) return res.status(404).json({ message: 'Job not found' });
        return res.status(400).json({ message: 'Job is not saved' });
      }

      const entry = job.savedBy.find(
        (s) => s.user.toString() === req.user._id.toString()
      );

      res.json({
        message: 'Tracking info updated',
        applicationDate: entry.applicationDate,
        interviewDate: entry.interviewDate,
        followUpDate: entry.followUpDate,
        documentLinks: entry.documentLinks,
        statusHistory: entry.statusHistory,
      });
    } catch (error) {
      console.error('Update tracking info error:', error);
      res.status(500).json({ message: 'Error updating tracking info' });
    }
  }
);

// Update application status
router.put(
  '/:id/status',
  [
    authenticateToken,
    body('status').isIn(APPLICATION_STATUS_VALUES),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const { id } = req.params;
      const { status } = req.body;
      const source = getSource(req);
      const now = new Date();

      // Atomic update with positional operator; $slice caps history at 50 entries
      const job = await Job.findOneAndUpdate(
        { jobId: id, source, 'savedBy.user': req.user._id },
        {
          $set: {
            'savedBy.$.applicationStatus': status,
            'savedBy.$.statusUpdatedAt': now,
          },
          $push: {
            'savedBy.$.statusHistory': {
              $each: [{ status, changedAt: now }],
              $slice: -50,
            },
          },
        },
        { new: true }
      );

      if (!job) {
        const exists = await Job.exists({ jobId: id, source });
        if (!exists) {
          return res.status(404).json({ message: 'Job not found' });
        }
        return res.status(400).json({ message: 'Job is not saved' });
      }

      const entry = job.savedBy.find(
        (s) => s.user.toString() === req.user._id.toString()
      );

      res.json({
        message: 'Application status updated',
        applicationStatus: status,
        statusUpdatedAt: entry.statusUpdatedAt,
        statusHistory: entry.statusHistory,
      });
    } catch (error) {
      console.error('Update application status error:', error);
      res.status(500).json({ message: 'Error updating application status' });
    }
  }
);

module.exports = router;
