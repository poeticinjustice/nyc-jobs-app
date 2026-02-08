const express = require('express');
const axios = require('axios');
const { body, query, validationResult } = require('express-validator');
const Job = require('../models/Job');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const {
  cleanJobFields,
  deduplicateJobs,
  filterJobs,
  sortJobs,
  transformNycJob,
} = require('../helpers/jobHelpers');

const router = express.Router();

// --- In-memory caches ---

let jobsCache = null;
let cacheTimestamp = null;
let categoriesCache = null;
let agenciesCache = null;
const CACHE_DURATION = 60 * 60 * 1000; // 60 minutes

const searchResultCache = new Map();
const SEARCH_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_SEARCH_CACHE_SIZE = 100;

// Periodically clean expired search cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of searchResultCache.entries()) {
    if (now - value.timestamp > SEARCH_CACHE_DURATION) {
      searchResultCache.delete(key);
    }
  }
}, 60 * 1000); // every minute

// --- Helpers ---

const generateSearchCacheKey = (params) => {
  const { q, category, location, agency, salary_min, salary_max, sort } = params;
  return JSON.stringify([q || '', category || '', location || '', agency || '', salary_min || '', salary_max || '', sort || '']);
};

// Fetch all jobs from NYC API with caching and retry
const fetchAllJobs = async () => {
  const now = Date.now();

  if (jobsCache && cacheTimestamp && now - cacheTimestamp < CACHE_DURATION) {
    return jobsCache;
  }

  let allJobs = [];
  let offset = 0;
  const batchSize = 1000;
  const maxRetries = 3;
  const baseDelay = 1000;

  let fetchFailed = false;
  let hasMoreData = true;
  while (hasMoreData) {
    const params = new URLSearchParams();
    params.append('$limit', batchSize);
    params.append('$offset', offset);

    let batchJobs = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await axios.get(
          `${process.env.NYC_JOBS_API_URL}?${params.toString()}`,
          { timeout: 30000 }
        );
        batchJobs = response.data;
        break;
      } catch (error) {
        if (attempt < maxRetries - 1) {
          await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        }
      }
    }

    if (!batchJobs) {
      fetchFailed = true;
      hasMoreData = false;
    } else if (batchJobs.length === 0) {
      hasMoreData = false;
    } else {
      allJobs = allJobs.concat(batchJobs);
      offset += batchSize;
      if (offset > 50000) hasMoreData = false;
    }
  }

  // Don't cache empty/partial results from a failed fetch — serve stale cache if available
  if (fetchFailed && allJobs.length === 0) {
    if (jobsCache) return jobsCache;
    return [];
  }

  allJobs = deduplicateJobs(allJobs).map(cleanJobFields);
  jobsCache = allJobs;
  cacheTimestamp = now;

  // Pre-compute derived caches
  categoriesCache = [...new Set(allJobs.map((j) => j.job_category).filter(Boolean))].sort();
  agenciesCache = [...new Set(allJobs.map((j) => j.agency).filter(Boolean))].sort();

  return allJobs;
};

// --- Routes ---

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    cacheStatus: jobsCache ? 'cached' : 'not cached',
    cacheSize: jobsCache ? jobsCache.length : 0,
    cacheTimestamp: cacheTimestamp ? new Date(cacheTimestamp).toISOString() : null,
    cacheAge: cacheTimestamp ? Math.round((Date.now() - cacheTimestamp) / 1000) : null,
    searchCacheSize: searchResultCache.size,
  });
});

// NYC API health check
router.get('/nyc-api-health', async (req, res) => {
  try {
    const startTime = Date.now();
    const response = await axios.get(`${process.env.NYC_JOBS_API_URL}?$limit=1`, {
      timeout: 10000,
    });
    res.json({
      status: 'ok',
      responseTime: `${Date.now() - startTime}ms`,
      nycApiStatus: response.status,
      nycApiWorking: true,
      sampleData: response.data.length > 0 ? 'Available' : 'No data',
    });
  } catch (error) {
    res.json({
      status: 'error',
      nycApiWorking: false,
      error: error.message,
      errorCode: error.code,
      responseStatus: error.response?.status,
    });
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
      .isIn(['date_desc', 'date_asc', 'title_asc', 'title_desc', 'salary_desc', 'salary_asc']),
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
      } = req.query;

      // Check search result cache
      const cacheKey = generateSearchCacheKey({ q, category, location, agency, salary_min, salary_max, sort });
      const cachedSearch = searchResultCache.get(cacheKey);

      let jobs;
      if (cachedSearch && Date.now() - cachedSearch.timestamp < SEARCH_CACHE_DURATION) {
        jobs = cachedSearch.results;
      } else {
        // Always use the full cached dataset and filter in-memory (fast, no injection risk)
        const allJobs = await fetchAllJobs();
        jobs = filterJobs(allJobs, { q, category, location, agency, salary_min, salary_max });
        jobs = sortJobs(jobs, sort);

        // Cache filtered+sorted results for pagination
        if (searchResultCache.size >= MAX_SEARCH_CACHE_SIZE) {
          const oldestKey = searchResultCache.keys().next().value;
          searchResultCache.delete(oldestKey);
        }
        searchResultCache.set(cacheKey, { results: jobs, timestamp: Date.now() });
      }

      // Paginate
      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const paginatedJobs = jobs.slice(startIndex, startIndex + parseInt(limit));

      // Check saved status for authenticated users
      let savedJobIds = [];
      if (req.user) {
        const savedJobs = await Job.find({
          'savedBy.user': req.user._id,
          jobId: { $in: paginatedJobs.map((job) => job.job_id) },
        });
        savedJobIds = savedJobs.map((job) => job.jobId);
      }

      // Transform to camelCase and add saved status
      const jobsWithStatus = paginatedJobs.map((job) => ({
        ...transformNycJob(job),
        isSaved: savedJobIds.includes(job.job_id),
      }));

      res.json({
        jobs: jobsWithStatus,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: jobs.length,
          pages: Math.ceil(jobs.length / parseInt(limit)),
        },
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
    await fetchAllJobs(); // ensure cache is populated
    res.json({ categories: categoriesCache });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Error fetching categories' });
  }
});

// Get agencies list
router.get('/agencies', async (req, res) => {
  try {
    await fetchAllJobs(); // ensure cache is populated
    res.json({ agencies: agenciesCache });
  } catch (error) {
    console.error('Get agencies error:', error);
    res.status(500).json({ message: 'Error fetching agencies' });
  }
});

// Get saved jobs
router.get('/saved', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const queryFilter = status
      ? { savedBy: { $elemMatch: { user: req.user._id, applicationStatus: status } } }
      : { 'savedBy.user': req.user._id };

    const total = await Job.countDocuments(queryFilter);

    const jobs = await Job.find(queryFilter)
      .sort({ updatedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    // Add the current user's save entry fields as top-level fields
    const jobsWithStatus = jobs.map((job) => {
      const entry = job.savedBy?.find(
        (s) => s.user.toString() === req.user._id.toString()
      );
      return {
        ...job,
        savedAt: entry?.savedAt,
        applicationStatus: entry?.applicationStatus || 'interested',
        statusUpdatedAt: entry?.statusUpdatedAt,
      };
    });

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
    const queryFilter = status
      ? { savedBy: { $elemMatch: { user: req.user._id, applicationStatus: status } } }
      : { 'savedBy.user': req.user._id };

    const jobs = await Job.find(queryFilter).sort({ updatedAt: -1 }).lean();

    const headers = [
      'Job ID',
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
    ];

    const escCsv = (val) => {
      if (val == null) return '';
      const s = String(val);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const rows = jobs.map((job) => {
      const entry = job.savedBy?.find(
        (s) => s.user.toString() === req.user._id.toString()
      );
      return [
        job.jobId,
        job.businessTitle,
        job.agency,
        job.jobCategory,
        job.workLocation,
        job.salaryRangeFrom,
        job.salaryRangeTo,
        job.salaryFrequency,
        job.fullTimePartTimeIndicator,
        job.level,
        job.postDate ? new Date(job.postDate).toISOString().split('T')[0] : '',
        entry?.applicationStatus || 'interested',
        entry?.savedAt ? new Date(entry.savedAt).toISOString().split('T')[0] : '',
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
    const allJobs = await fetchAllJobs();
    const nycJob = allJobs.find((job) => job.job_id === id);

    if (!nycJob) {
      return res.status(404).json({ message: 'Job not found' });
    }

    let isSaved = false;
    let applicationStatus = null;
    let statusHistory = [];
    if (req.user) {
      const savedJob = await Job.findOne({ jobId: id, 'savedBy.user': req.user._id }).lean();
      if (savedJob) {
        isSaved = true;
        const entry = savedJob.savedBy.find(
          (s) => s.user.toString() === req.user._id.toString()
        );
        applicationStatus = entry?.applicationStatus || 'interested';
        statusHistory = entry?.statusHistory || [];
      }
    }

    res.json({ ...transformNycJob(nycJob), isSaved, applicationStatus, statusHistory });
  } catch (error) {
    console.error('Get job details error:', error);
    res.status(500).json({ message: 'Error fetching job details' });
  }
});

// Save a job
router.post('/:id/save', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    let job = await Job.findOne({ jobId: id });

    if (!job) {
      try {
        const response = await axios.get(`${process.env.NYC_JOBS_API_URL}?job_id=${id}`, {
          timeout: 10000,
        });

        const nycJobs = response.data;
        if (!nycJobs || nycJobs.length === 0) {
          return res.status(404).json({ message: 'Job not found in NYC API' });
        }

        job = new Job(transformNycJob(nycJobs[0], { clean: true }));
      } catch (fetchError) {
        return res.status(500).json({
          message: 'Failed to fetch job from NYC API',
          error: fetchError.message,
        });
      }
    }

    if (job.savedBy.some((s) => s.user.toString() === req.user._id.toString())) {
      return res.status(400).json({ message: 'Job already saved' });
    }

    job.savedBy.push({
      user: req.user._id,
      savedAt: new Date(),
      applicationStatus: 'interested',
      statusUpdatedAt: new Date(),
      statusHistory: [{ status: 'interested', changedAt: new Date() }],
    });
    await job.save();

    res.json({ message: 'Job saved successfully', job });
  } catch (error) {
    console.error('Error saving job:', error);
    res.status(500).json({ message: 'Failed to save job' });
  }
});

// Unsave a job
router.delete('/:id/save', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const job = await Job.findOne({ jobId: id });
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    job.savedBy = job.savedBy.filter((s) => s.user.toString() !== req.user._id.toString());
    await job.save();

    res.json({ message: 'Job unsaved successfully' });
  } catch (error) {
    console.error('Unsave job error:', error);
    res.status(500).json({ message: 'Error unsaving job' });
  }
});

// Update application status
router.put(
  '/:id/status',
  [
    authenticateToken,
    body('status').isIn(['interested', 'applied', 'interviewing', 'offered', 'rejected']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const { id } = req.params;
      const { status } = req.body;

      const job = await Job.findOne({ jobId: id });
      if (!job) {
        return res.status(404).json({ message: 'Job not found' });
      }

      const entry = job.savedBy.find(
        (s) => s.user.toString() === req.user._id.toString()
      );
      if (!entry) {
        return res.status(400).json({ message: 'Job is not saved' });
      }

      entry.applicationStatus = status;
      entry.statusUpdatedAt = new Date();
      entry.statusHistory.push({ status, changedAt: new Date() });
      await job.save();

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
