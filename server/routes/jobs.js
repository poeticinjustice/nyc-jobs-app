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
  transformUsaJob,
  getUserSaveEntry,
  escCsv,
} = require('../helpers/jobHelpers');
const { fetchUsaJobById } = require('../helpers/usaJobsApi');
const { fetchAdzunaJobs, cleanSearchCache: cleanAdzunaCache } = require('../helpers/adzunaApi');

const router = express.Router();

// --- In-memory caches ---

let jobsCache = null;
let jobIdMap = null; // Map<job_id, job> for O(1) lookups
let cacheTimestamp = null;
let categoriesCache = null;
let agenciesCache = null;
const CACHE_DURATION = 60 * 60 * 1000; // 60 minutes
const MAX_NYC_API_OFFSET = 50000;

const searchResultCache = new Map();
const SEARCH_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_SEARCH_CACHE_SIZE = 100;

const usaJobsSearchCache = new Map();
const USA_SEARCH_CACHE_DURATION = 5 * 60 * 1000;
const MAX_USA_SEARCH_CACHE_SIZE = 50;

// Periodically clean expired search cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of searchResultCache.entries()) {
    if (now - value.timestamp > SEARCH_CACHE_DURATION) {
      searchResultCache.delete(key);
    }
  }
  for (const [key, value] of usaJobsSearchCache.entries()) {
    if (now - value.timestamp > USA_SEARCH_CACHE_DURATION) {
      usaJobsSearchCache.delete(key);
    }
  }
  cleanAdzunaCache();
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
      if (offset > MAX_NYC_API_OFFSET) hasMoreData = false;
    }
  }

  // Don't cache partial results from a failed fetch — serve stale cache if available
  if (fetchFailed) {
    if (jobsCache) return jobsCache;
    if (allJobs.length === 0) return [];
    // No stale cache and we got partial data — use it but with a short TTL
    allJobs = deduplicateJobs(allJobs).map(cleanJobFields);
    jobsCache = allJobs;
    cacheTimestamp = now - CACHE_DURATION + 5 * 60 * 1000; // expire in 5 min
    jobIdMap = new Map(allJobs.map((j) => [j.job_id, j]));
    categoriesCache = [...new Set(allJobs.map((j) => j.job_category).filter(Boolean))].sort();
    agenciesCache = [...new Set(allJobs.map((j) => j.agency).filter(Boolean))].sort();
    return allJobs;
  }

  allJobs = deduplicateJobs(allJobs).map(cleanJobFields);
  jobsCache = allJobs;
  cacheTimestamp = now;

  // Pre-compute derived caches
  jobIdMap = new Map(allJobs.map((j) => [j.job_id, j]));
  categoriesCache = [...new Set(allJobs.map((j) => j.job_category).filter(Boolean))].sort();
  agenciesCache = [...new Set(allJobs.map((j) => j.agency).filter(Boolean))].sort();

  return allJobs;
};

// Map our sort params to USAJobs SortField/SortDirection
const USA_SORT_MAP = {
  date_desc: { SortField: 'opendate', SortDirection: 'Desc' },
  date_asc: { SortField: 'opendate', SortDirection: 'Asc' },
  title_asc: { SortField: 'jobtitle', SortDirection: 'Asc' },
  title_desc: { SortField: 'jobtitle', SortDirection: 'Desc' },
  salary_desc: { SortField: 'salary', SortDirection: 'Desc' },
  salary_asc: { SortField: 'salary', SortDirection: 'Asc' },
};

// Fetch jobs from USAJobs API with caching
const fetchUsaJobs = async ({ q, category, location, agency, salary_min, salary_max, sort = 'date_desc', page = 1, limit = 20 }) => {
  const cacheKey = JSON.stringify(['usa', q || '', category || '', location || '', agency || '', salary_min || '', salary_max || '', sort, page, limit]);
  const cached = usaJobsSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < USA_SEARCH_CACHE_DURATION) {
    // Move to end for LRU ordering
    usaJobsSearchCache.delete(cacheKey);
    usaJobsSearchCache.set(cacheKey, cached);
    return cached.data;
  }

  const params = new URLSearchParams();

  // Combine keyword, category, and agency into Keyword
  const keywordParts = [q, category, agency].filter(Boolean);
  if (keywordParts.length > 0) {
    params.append('Keyword', keywordParts.join(' '));
  }
  if (location) params.append('LocationName', location);
  if (salary_min) params.append('RemunerationMinimumAmount', salary_min);
  if (salary_max) params.append('RemunerationMaximumAmount', salary_max);

  const sortConfig = USA_SORT_MAP[sort] || USA_SORT_MAP.date_desc;
  params.append('SortField', sortConfig.SortField);
  params.append('SortDirection', sortConfig.SortDirection);
  params.append('ResultsPerPage', String(Math.min(parseInt(limit), 250)));
  params.append('Page', String(page));
  params.append('Fields', 'Full');

  try {
    const response = await axios.get(`${process.env.USAJOBS_BASE_URL}?${params.toString()}`, {
      headers: {
        'Authorization-Key': process.env.USAJOBS_API_KEY,
        'User-Agent': process.env.USAJOBS_EMAIL,
        Host: 'data.usajobs.gov',
      },
      timeout: 15000,
    });

    const searchResult = response.data.SearchResult;
    const items = searchResult.SearchResultItems || [];
    const totalCount = parseInt(searchResult.SearchResultCountAll) || 0;
    const jobs = items.map(transformUsaJob);

    const result = { jobs, total: totalCount };

    if (usaJobsSearchCache.size >= MAX_USA_SEARCH_CACHE_SIZE) {
      const oldestKey = usaJobsSearchCache.keys().next().value;
      usaJobsSearchCache.delete(oldestKey);
    }
    usaJobsSearchCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  } catch (error) {
    console.error('USAJobs API error:', error.message);
    return { jobs: [], total: 0 };
  }
};

// Sort merged camelCase jobs (for 'all' mode where NYC + federal are combined)
const sortMergedJobs = (jobs, sort) => {
  const sorted = [...jobs];
  switch (sort) {
    case 'date_asc':
      sorted.sort((a, b) => new Date(a.postDate || 0) - new Date(b.postDate || 0));
      break;
    case 'title_asc':
      sorted.sort((a, b) => (a.businessTitle || '').localeCompare(b.businessTitle || ''));
      break;
    case 'title_desc':
      sorted.sort((a, b) => (b.businessTitle || '').localeCompare(a.businessTitle || ''));
      break;
    case 'salary_desc':
      sorted.sort((a, b) => {
        const sa = a.salaryRangeFrom != null ? (a.salaryRangeFrom + (a.salaryRangeTo || a.salaryRangeFrom)) / 2 : null;
        const sb = b.salaryRangeFrom != null ? (b.salaryRangeFrom + (b.salaryRangeTo || b.salaryRangeFrom)) / 2 : null;
        if (sa == null && sb == null) return 0;
        if (sa == null) return 1;
        if (sb == null) return -1;
        return sb - sa;
      });
      break;
    case 'salary_asc':
      sorted.sort((a, b) => {
        const sa = a.salaryRangeFrom != null ? (a.salaryRangeFrom + (a.salaryRangeTo || a.salaryRangeFrom)) / 2 : null;
        const sb = b.salaryRangeFrom != null ? (b.salaryRangeFrom + (b.salaryRangeTo || b.salaryRangeFrom)) / 2 : null;
        if (sa == null && sb == null) return 0;
        if (sa == null) return 1;
        if (sb == null) return -1;
        return sa - sb;
      });
      break;
    case 'date_desc':
    default:
      sorted.sort((a, b) => new Date(b.postDate || 0) - new Date(a.postDate || 0));
      break;
  }
  return sorted;
};

// Build query filter for a user's saved jobs, optionally filtered by status
const buildSavedJobsFilter = (userId, status) =>
  status
    ? { savedBy: { $elemMatch: { user: userId, applicationStatus: status } } }
    : { 'savedBy.user': userId };

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
    query('source').optional().isIn(['nyc', 'federal', 'adzuna', 'all']),
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
        source = 'nyc',
      } = req.query;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      let jobs = [];
      let total = 0;

      // --- NYC path ---
      if (source === 'nyc' || source === 'all') {
        const cacheKey = generateSearchCacheKey({ q, category, location, agency, salary_min, salary_max, sort });
        const cachedSearch = searchResultCache.get(cacheKey);

        let nycJobs;
        if (cachedSearch && Date.now() - cachedSearch.timestamp < SEARCH_CACHE_DURATION) {
          // Move to end for LRU ordering
          searchResultCache.delete(cacheKey);
          searchResultCache.set(cacheKey, cachedSearch);
          nycJobs = cachedSearch.results;
        } else {
          const allJobs = await fetchAllJobs();
          nycJobs = filterJobs(allJobs, { q, category, location, agency, salary_min, salary_max });
          nycJobs = sortJobs(nycJobs, sort);

          if (searchResultCache.size >= MAX_SEARCH_CACHE_SIZE) {
            const oldestKey = searchResultCache.keys().next().value;
            searchResultCache.delete(oldestKey);
          }
          searchResultCache.set(cacheKey, { results: nycJobs, timestamp: Date.now() });
        }

        if (source === 'nyc') {
          total = nycJobs.length;
          const startIndex = (pageNum - 1) * limitNum;
          const paginatedJobs = nycJobs.slice(startIndex, startIndex + limitNum);

          let savedJobIds = [];
          if (req.user) {
            const savedJobs = await Job.find({
              'savedBy.user': req.user._id,
              jobId: { $in: paginatedJobs.map((job) => job.job_id) },
              source: 'nyc',
            });
            savedJobIds = savedJobs.map((job) => job.jobId);
          }

          jobs = paginatedJobs.map((job) => ({
            ...transformNycJob(job),
            source: 'nyc',
            isSaved: savedJobIds.includes(job.job_id),
          }));
        } else {
          // 'all' mode: transform for merging (don't paginate yet)
          jobs = nycJobs.map((job) => ({
            ...transformNycJob(job),
            source: 'nyc',
          }));
        }
      }

      // --- Federal path ---
      if (source === 'federal' || source === 'all') {
        if (source === 'federal') {
          const usaResult = await fetchUsaJobs({ q, category, location, agency, salary_min, salary_max, sort, page: pageNum, limit: limitNum });
          jobs = usaResult.jobs.map((job) => ({ ...job, source: 'federal' }));
          total = usaResult.total;
        } else {
          // 'all' mode: fetch federal jobs scoped to NYC, merge with city jobs
          const nycLocation = location || 'New York';
          const usaResult = await fetchUsaJobs({ q, category, location: nycLocation, agency, salary_min, salary_max, sort, page: 1, limit: 250 });
          const federalJobs = usaResult.jobs.map((job) => ({ ...job, source: 'federal' }));
          jobs = [...jobs, ...federalJobs];
        }
      }

      // --- Adzuna path ---
      if (source === 'adzuna' || source === 'all') {
        if (source === 'adzuna') {
          const adzunaResult = await fetchAdzunaJobs({ q, location, category, salary_min, salary_max, sort, page: pageNum, limit: limitNum });
          jobs = adzunaResult.jobs.map((job) => ({ ...job, source: 'adzuna' }));
          total = adzunaResult.total;
        } else {
          // 'all' mode: fetch Adzuna jobs scoped to NYC, merge with existing
          const nycLocation = location || 'New York';
          const adzunaResult = await fetchAdzunaJobs({ q, location: nycLocation, category, salary_min, salary_max, sort, page: 1, limit: 50 });
          const adzunaJobs = adzunaResult.jobs.map((job) => ({ ...job, source: 'adzuna' }));
          jobs = [...jobs, ...adzunaJobs];
        }
      }

      // 'all' mode: sort merged results and paginate
      if (source === 'all') {
        jobs = sortMergedJobs(jobs, sort);
        total = jobs.length;
        const startIndex = (pageNum - 1) * limitNum;
        jobs = jobs.slice(startIndex, startIndex + limitNum);
      }

      // Check saved status for authenticated users (non-nyc modes)
      if (req.user && source !== 'nyc') {
        const jobIds = jobs.map((j) => j.jobId);
        const savedJobs = await Job.find({
          'savedBy.user': req.user._id,
          jobId: { $in: jobIds },
        }).lean();
        const savedJobIdSet = new Set(savedJobs.map((j) => j.jobId));
        jobs = jobs.map((job) => ({
          ...job,
          isSaved: job.isSaved || savedJobIdSet.has(job.jobId),
        }));
      }

      res.json({
        jobs,
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

    const queryFilter = buildSavedJobsFilter(req.user._id, status);

    const total = await Job.countDocuments(queryFilter);

    const jobs = await Job.find(queryFilter)
      .sort({ updatedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    const jobsWithStatus = jobs.map((job) => ({
      ...job,
      ...getUserSaveEntry(job, req.user._id),
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

    const jobs = await Job.find(queryFilter).sort({ updatedAt: -1 }).lean();

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
    ];

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
        job.postDate ? new Date(job.postDate).toISOString().split('T')[0] : '',
        entry.applicationStatus || 'interested',
        entry.savedAt ? new Date(entry.savedAt).toISOString().split('T')[0] : '',
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

    let jobData = null;
    const jobSource = source || 'nyc';

    // Try NYC source
    if (jobSource === 'nyc') {
      await fetchAllJobs(); // ensure cache is populated
      const nycJob = jobIdMap?.get(id);
      if (nycJob) {
        jobData = { ...transformNycJob(nycJob), source: 'nyc' };
      }
    }

    // Try federal source
    if (!jobData && (jobSource === 'federal' || !source)) {
      const savedJob = await Job.findOne({ jobId: id, source: 'federal' }).lean();
      if (savedJob) {
        jobData = { ...savedJob, source: 'federal' };
      } else {
        const federalJob = await fetchUsaJobById(id);
        if (federalJob) {
          jobData = { ...federalJob, source: 'federal' };
        }
      }
    }

    // Try Adzuna source (DB only — Adzuna has no single-job fetch endpoint)
    if (!jobData && (jobSource === 'adzuna' || !source)) {
      const savedJob = await Job.findOne({ jobId: id, source: 'adzuna' }).lean();
      if (savedJob) {
        jobData = { ...savedJob, source: 'adzuna' };
      }
    }

    if (!jobData) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Check saved status
    let saveEntry = { isSaved: false, applicationStatus: null, statusHistory: [] };
    if (req.user) {
      const savedJob = await Job.findOne({
        jobId: id,
        source: jobData.source,
        'savedBy.user': req.user._id,
      }).lean();
      if (savedJob) {
        saveEntry = getUserSaveEntry(savedJob, req.user._id);
      }
    }

    res.json({ ...jobData, ...saveEntry });
  } catch (error) {
    console.error('Get job details error:', error);
    res.status(500).json({ message: 'Error fetching job details' });
  }
});

// Save a job
router.post('/:id/save', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { source = 'nyc' } = req.body;

    let job = await Job.findOne({ jobId: id, source });

    if (!job) {
      if (source === 'adzuna') {
        // Adzuna has no single-job fetch endpoint — create from request body data
        const jobData = req.body.jobData;
        if (!jobData || !jobData.businessTitle) {
          return res.status(404).json({ message: 'Job not found. Please include job data.' });
        }
        job = new Job({ ...jobData, jobId: id, source: 'adzuna' });
      } else if (source === 'federal') {
        const federalJob = await fetchUsaJobById(id);
        if (!federalJob) {
          return res.status(404).json({ message: 'Job not found in USAJobs API' });
        }
        job = new Job({ ...federalJob, source: 'federal' });
      } else {
        try {
          const response = await axios.get(`${process.env.NYC_JOBS_API_URL}?job_id=${id}`, {
            timeout: 10000,
          });

          const nycJobs = response.data;
          if (!nycJobs || nycJobs.length === 0) {
            return res.status(404).json({ message: 'Job not found in NYC API' });
          }

          job = new Job({ ...transformNycJob(nycJobs[0], { clean: true }), source: 'nyc' });
        } catch (fetchError) {
          return res.status(500).json({
            message: 'Failed to fetch job from NYC API',
            error: fetchError.message,
          });
        }
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
    const { source = 'nyc' } = req.query;

    const job = await Job.findOne({ jobId: id, source });
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
      const { status, source = 'nyc' } = req.body;

      const job = await Job.findOne({ jobId: id, source });
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
