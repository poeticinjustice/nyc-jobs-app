const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, query, validationResult } = require('express-validator');
const Job = require('../models/Job');
const Note = require('../models/Note');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { getUserSaveEntry, escCsv, escapeRegex } = require('../helpers/jobHelpers');
const { geocodeLocationBase } = require('../helpers/geocoding');
const {
  JOB_SOURCES,
  VALID_SOURCE_FILTERS,
  APPLICATION_STATUS_VALUES,
  SORT_VALUES,
  DOC_LINK_MAX,
  DOC_LABEL_MAX,
} = require('../../shared/constants');

const router = express.Router();

// --- Helpers ---

// Validate and default job source from request body or query
const getSource = (req) => {
  const raw = req.body.source || req.query.source;
  return JOB_SOURCES.includes(raw) ? raw : 'nyc';
};

// Build Mongoose sort from query param
const buildSort = (sort) => {
  switch (sort) {
    case 'date_asc': return { postDate: 1 };
    case 'title_asc': return { businessTitle: 1 };
    case 'title_desc': return { businessTitle: -1 };
    case 'salary_desc': return { salaryRangeFrom: -1 };
    case 'salary_asc': return { salaryRangeFrom: 1 };
    case 'date_desc':
    default: return { postDate: -1 };
  }
};

// Build Mongoose filter from search params
const buildSearchFilter = ({ q, category, location, agency, salary_min, salary_max, source }) => {
  const filter = {};

  if (source && source !== 'all') {
    filter.source = source;
  } else {
    // 'all' still restricts to valid sources — prevents stale/unknown sources from leaking
    filter.source = { $in: JOB_SOURCES };
  }

  if (q) {
    filter.$text = { $search: q };
  }

  if (category) {
    filter.jobCategory = new RegExp(`^${escapeRegex(category)}$`, 'i');
  }

  if (location) {
    const locRegex = new RegExp(escapeRegex(location), 'i');
    filter.$or = [
      { workLocation: locRegex },
      { workLocation1: locRegex },
    ];
  }

  if (agency) {
    filter.agency = new RegExp(escapeRegex(agency), 'i');
  }

  // Salary overlap: job range overlaps with [salary_min, salary_max]
  if (salary_min || salary_max) {
    const salaryConditions = [];
    if (salary_min) {
      const min = parseInt(salary_min, 10);
      if (!isNaN(min)) {
        // Job's upper bound >= min (or lower bound if no upper)
        salaryConditions.push({
          $or: [
            { salaryRangeTo: { $gte: min } },
            { salaryRangeTo: null, salaryRangeFrom: { $gte: min } },
          ],
        });
      }
    }
    if (salary_max) {
      const max = parseInt(salary_max, 10);
      if (!isNaN(max)) {
        // Job's lower bound <= max (or upper bound if no lower)
        salaryConditions.push({
          $or: [
            { salaryRangeFrom: { $lte: max } },
            { salaryRangeFrom: null, salaryRangeTo: { $lte: max } },
          ],
        });
      }
    }
    if (salaryConditions.length > 0) {
      // Combine with any existing $or (location) using $and
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, ...salaryConditions];
        delete filter.$or;
      } else if (salaryConditions.length === 1) {
        Object.assign(filter, salaryConditions[0]);
      } else {
        filter.$and = salaryConditions;
      }
    }
  }

  return filter;
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

// Monthly request counter (resets on 1st of each month)
let mapMonthlyCount = 0;
let mapMonthlyReset = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime();
const MAP_MONTHLY_LIMIT = 25000;

const mapMonthlyLimit = (req, res, next) => {
  const now = Date.now();
  if (now >= mapMonthlyReset) {
    mapMonthlyCount = 0;
    const d = new Date();
    mapMonthlyReset = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  }
  if (mapMonthlyCount >= MAP_MONTHLY_LIMIT) {
    return res.status(429).json({ message: 'Monthly map request limit reached. Please try again next month.' });
  }
  mapMonthlyCount++;
  next();
};

// --- Routes ---

// Map data — returns GeoJSON FeatureCollection from pre-geocoded jobs
router.get(
  '/map',
  [
    mapRateLimit,
    mapMonthlyLimit,
    query('source').optional().isIn(VALID_SOURCE_FILTERS),
    query('keyword').optional().trim(),
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
        .limit(2000)
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
        metadata: { total: features.length, geocoded: features.length },
      });
    } catch (error) {
      console.error('Map data error:', error);
      res.status(500).json({ message: 'Error fetching map data' });
    }
  }
);

// Health check
router.get('/health', async (req, res) => {
  try {
    const count = await Job.estimatedDocumentCount();
    res.json({
      status: 'ok',
      jobsInDatabase: count,
    });
  } catch (error) {
    res.json({ status: 'ok', jobsInDatabase: 'unknown' });
  }
});

// Search jobs
router.get(
  '/search',
  [
    optionalAuth,
    query('q').optional().trim(),
    query('category').optional().trim(),
    query('location').optional().trim(),
    query('agency').optional().trim(),
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
    query('page').optional().isNumeric(),
    query('limit').optional().isNumeric(),
    query('sort')
      .optional()
      .isIn(SORT_VALUES),
    query('source').optional().isIn(VALID_SOURCE_FILTERS),
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

      // Check saved status for authenticated users
      let jobsWithStatus = jobs;
      if (req.user) {
        const jobIds = jobs.map((j) => j.jobId);
        const savedJobs = await Job.find({
          'savedBy.user': req.user._id,
          jobId: { $in: jobIds },
          source: { $in: JOB_SOURCES },
        }).lean();
        const savedJobMap = new Set(savedJobs.map((j) => `${j.source}:${j.jobId}`));
        jobsWithStatus = jobs.map((job) => ({
          ...job,
          isSaved: savedJobMap.has(`${job.source}:${job.jobId}`),
        }));
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
    const categories = await Job.distinct('jobCategory', { jobCategory: { $ne: null }, source: { $in: JOB_SOURCES } });
    res.json({ categories: categories.sort() });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Error fetching categories' });
  }
});

// Get agencies list
router.get('/agencies', async (req, res) => {
  try {
    const agencies = await Job.distinct('agency', { agency: { $ne: null }, source: { $in: JOB_SOURCES } });
    res.json({ agencies: agencies.sort() });
  } catch (error) {
    console.error('Get agencies error:', error);
    res.status(500).json({ message: 'Error fetching agencies' });
  }
});

// Get saved jobs
router.get('/saved', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, sort = 'updated_desc' } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);

    const queryFilter = buildSavedJobsFilter(req.user._id, status);

    const savedSortMap = {
      updated_desc: { updatedAt: -1 },
      saved_desc: { 'savedBy.savedAt': -1 },
      date_desc: { postDate: -1 },
      date_asc: { postDate: 1 },
      title_asc: { businessTitle: 1 },
      title_desc: { businessTitle: -1 },
      salary_desc: { salaryRangeFrom: -1 },
      salary_asc: { salaryRangeFrom: 1 },
    };
    const mongoSort = savedSortMap[sort] || savedSortMap.updated_desc;

    const total = await Job.countDocuments(queryFilter);

    const jobs = await Job.find(queryFilter)
      .sort(mongoSort)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    // Fetch note counts for the returned jobs in one query
    const jobIds = jobs.map((j) => j.jobId);
    const noteCounts = await Note.aggregate([
      { $match: { user: req.user._id, status: 'active', jobId: { $in: jobIds } } },
      { $group: { _id: '$jobId', count: { $sum: 1 } } },
    ]);
    const noteCountMap = Object.fromEntries(noteCounts.map((n) => [n._id, n.count]));

    const jobsWithStatus = jobs.map((job) => ({
      ...job,
      ...getUserSaveEntry(job, req.user._id),
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
router.get('/saved/export', authenticateToken, async (req, res) => {
  try {
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

// Get job details
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { source } = req.query;
    const jobSource = source || 'nyc';

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
