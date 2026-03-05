const express = require('express');
const axios = require('axios');
const { body, query, validationResult } = require('express-validator');
const Job = require('../models/Job');
const Note = require('../models/Note');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const {
  cleanJobFields,
  deduplicateJobs,
  filterJobs,
  sortJobs,
  sortMergedJobs,
  transformNycJob,
  transformUsaJob,
  getUserSaveEntry,
  escCsv,
} = require('../helpers/jobHelpers');
const { fetchUsaJobById, getUsaHeaders } = require('../helpers/usaJobsApi');
const { geocodeLocation } = require('../helpers/geocoding');
const LRUCache = require('../helpers/LRUCache');

const router = express.Router();

const VALID_SOURCES = ['nyc', 'federal'];

// --- In-memory caches ---

let jobsCache = null;
let jobIdMap = null; // Map<job_id, job> for O(1) lookups
let cacheTimestamp = null;
let categoriesCache = null;
let agenciesCache = null;
const CACHE_DURATION = 60 * 60 * 1000; // 60 minutes
const MAX_NYC_API_OFFSET = 50000;

const searchResultCache = new LRUCache(100, 5 * 60 * 1000);
const usaJobsSearchCache = new LRUCache(50, 5 * 60 * 1000);
const mapCache = new LRUCache(20, 10 * 60 * 1000);

// Periodically clean expired search cache entries (skip in test to avoid open handles)
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    searchResultCache.cleanExpired();
    usaJobsSearchCache.cleanExpired();
  }, 60 * 1000);
}

// --- Helpers ---

const generateSearchCacheKey = (params) => {
  const { q, category, location, agency, salary_min, salary_max, sort } = params;
  return JSON.stringify([q || '', category || '', location || '', agency || '', salary_min ?? '', salary_max ?? '', sort || '']);
};

// Fetch all jobs from NYC API with caching and retry
let fetchPromise = null;
const fetchAllJobs = async () => {
  const now = Date.now();

  if (jobsCache && cacheTimestamp && now - cacheTimestamp < CACHE_DURATION) {
    return jobsCache;
  }

  // Prevent concurrent fetches from hammering the API
  if (fetchPromise) return fetchPromise;
  fetchPromise = _fetchAllJobsImpl();
  try { return await fetchPromise; } finally { fetchPromise = null; }
};

const _fetchAllJobsImpl = async () => {
  const now = Date.now();
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
}; // end _fetchAllJobsImpl

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
  if (cached) return cached;

  const params = new URLSearchParams();

  // Combine keyword, category, and agency into Keyword
  const keywordParts = [q, category, agency].filter(Boolean);
  if (keywordParts.length > 0) {
    params.append('Keyword', keywordParts.join(' '));
  }
  params.append('LocationName', location || 'New York City, NY');
  if (salary_min) params.append('RemunerationMinimumAmount', salary_min);
  if (salary_max) params.append('RemunerationMaximumAmount', salary_max);

  const sortConfig = USA_SORT_MAP[sort] || USA_SORT_MAP.date_desc;
  params.append('SortField', sortConfig.SortField);
  params.append('SortDirection', sortConfig.SortDirection);
  params.append('ResultsPerPage', String(Math.min(parseInt(limit) || 20, 250)));
  params.append('Page', String(page));
  params.append('Fields', 'Full');

  try {
    const response = await axios.get(`${process.env.USAJOBS_BASE_URL}?${params.toString()}`, {
      headers: getUsaHeaders(),
      timeout: 15000,
    });

    const searchResult = response.data.SearchResult;
    const items = searchResult.SearchResultItems || [];
    const totalCount = parseInt(searchResult.SearchResultCountAll) || 0;
    const jobs = items.map(transformUsaJob).filter(Boolean);

    const result = { jobs, total: totalCount };
    usaJobsSearchCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('USAJobs API error:', error.message);
    return { jobs: [], total: 0 };
  }
};

// Build query filter for a user's saved jobs, optionally filtered by status
const buildSavedJobsFilter = (userId, status) =>
  status
    ? { savedBy: { $elemMatch: { user: userId, applicationStatus: status } } }
    : { 'savedBy.user': userId };

// --- Routes ---

// Map data — returns GeoJSON FeatureCollection of geocoded jobs
router.get(
  '/map',
  [
    query('source').optional().isIn(['nyc', 'federal', 'all']),
    query('category').optional().trim(),
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
        category = '',
        salary_min,
        salary_max,
      } = req.query;

      const cacheKey = JSON.stringify(['map', source, category, salary_min || '', salary_max || '']);
      const cached = mapCache.get(cacheKey);
      if (cached) return res.json(cached);

      let allJobs = [];

      if (source === 'nyc' || source === 'all') {
        const nycRaw = await fetchAllJobs();
        const filtered = filterJobs(nycRaw, { category, salary_min, salary_max });
        const transformed = filtered.map((job) => ({ ...transformNycJob(job), source: 'nyc' }));
        allJobs = allJobs.concat(transformed);
      }

      if (source === 'federal' || source === 'all') {
        try {
          const usaResult = await fetchUsaJobs({
            location: 'New York',
            category,
            salary_min,
            salary_max,
            page: 1,
            limit: 250,
          });
          const federalJobs = usaResult.jobs.map((job) => ({ ...job, source: 'federal' }));
          allJobs = allJobs.concat(federalJobs);
        } catch (usaError) {
          console.error('USAJobs API error during map fetch:', usaError.message);
          // Continue with NYC data only
        }
      }

      const features = [];
      for (const job of allJobs) {
        if (features.length >= 2000) break;
        const coords = geocodeLocation(job.workLocation, job.workLocation1);
        if (!coords) continue;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] },
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
        });
      }

      const result = {
        type: 'FeatureCollection',
        features,
        metadata: { total: allJobs.length, geocoded: features.length },
      };

      mapCache.set(cacheKey, result);
      res.json(result);
    } catch (error) {
      console.error('Map data error:', error);
      res.status(500).json({ message: 'Error fetching map data' });
    }
  }
);

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
    res.status(503).json({
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
    query('source').optional().isIn(['nyc', 'federal', 'all']),
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

      let jobs = [];
      let total = 0;

      // Helper: fetch and cache NYC search results
      const getNycSearchResults = async () => {
        const cacheKey = generateSearchCacheKey({ q, category, location, agency, salary_min, salary_max, sort });
        const cached = searchResultCache.get(cacheKey);
        if (cached) return cached;

        const allJobs = await fetchAllJobs();
        const filtered = sortJobs(filterJobs(allJobs, { q, category, location, agency, salary_min, salary_max }), sort);
        searchResultCache.set(cacheKey, filtered);
        return filtered;
      };

      if (source === 'all') {
        // Fetch NYC (full in-memory set) and one page of federal in parallel
        const [nycAllJobs, usaResult] = await Promise.all([
          getNycSearchResults(),
          fetchUsaJobs({ q, category, location: location || 'New York', agency, salary_min, salary_max, sort, page: 1, limit: 250 }),
        ]);

        // Transform and merge all available jobs, then sort and paginate the combined set
        const nycTransformed = nycAllJobs.map((job) => ({ ...transformNycJob(job), source: 'nyc' }));
        const federalJobs = usaResult.jobs.map((job) => ({ ...job, source: 'federal' }));
        const allMerged = sortMergedJobs([...nycTransformed, ...federalJobs], sort);

        total = allMerged.length;
        const start = (pageNum - 1) * limitNum;
        jobs = allMerged.slice(start, start + limitNum);
      } else if (source === 'nyc') {
        const nycJobs = await getNycSearchResults();
        total = nycJobs.length;
        const startIndex = (pageNum - 1) * limitNum;
        const paginatedJobs = nycJobs.slice(startIndex, startIndex + limitNum);

        let savedJobIdSet = new Set();
        if (req.user) {
          const savedJobs = await Job.find({
            'savedBy.user': req.user._id,
            jobId: { $in: paginatedJobs.map((job) => String(job.job_id)) },
            source: 'nyc',
          }).lean();
          savedJobIdSet = new Set(savedJobs.map((job) => String(job.jobId)));
        }

        jobs = paginatedJobs.map((job) => ({
          ...transformNycJob(job),
          source: 'nyc',
          isSaved: savedJobIdSet.has(String(job.job_id)),
        }));
      } else if (source === 'federal') {
        const usaResult = await fetchUsaJobs({ q, category, location, agency, salary_min, salary_max, sort, page: pageNum, limit: limitNum });
        jobs = usaResult.jobs.map((job) => ({ ...job, source: 'federal' }));
        total = usaResult.total;
      }

      // Check saved status for authenticated users (non-nyc modes)
      if (req.user && source !== 'nyc') {
        const jobIds = jobs.map((j) => j.jobId);
        const savedJobs = await Job.find({
          'savedBy.user': req.user._id,
          jobId: { $in: jobIds },
          source: { $in: VALID_SOURCES },
        }).lean();
        const savedJobMap = new Set(savedJobs.map((j) => `${j.source}:${j.jobId}`));
        jobs = jobs.map((job) => ({
          ...job,
          isSaved: job.isSaved || savedJobMap.has(`${job.source}:${job.jobId}`),
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
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 20, 100);

    const queryFilter = buildSavedJobsFilter(req.user._id, status);

    const total = await Job.countDocuments(queryFilter);

    const jobs = await Job.find(queryFilter)
      .sort({ updatedAt: -1 })
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

    let jobData = null;
    let fromDb = false;
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
    if (!jobData && jobSource === 'federal') {
      const savedJob = await Job.findOne({ jobId: id, source: 'federal' }).lean();
      if (savedJob) {
        jobData = { ...savedJob, source: 'federal' };
        fromDb = true;
      } else {
        try {
          const federalJob = await fetchUsaJobById(id);
          if (federalJob) {
            jobData = { ...federalJob, source: 'federal' };
          }
        } catch (usaError) {
          console.error('USAJobs API error during detail fetch:', usaError.message);
          return res.status(502).json({ message: 'Failed to fetch job from USAJobs API' });
        }
      }
    }

    if (!jobData) {
      return res.status(404).json({ message: 'Job not found' });
    }

    // Check saved status — reuse DB data if we already have it, otherwise query
    let saveEntry = { isSaved: false, applicationStatus: null, statusHistory: [] };
    if (req.user) {
      if (fromDb) {
        saveEntry = getUserSaveEntry(jobData, req.user._id);
      } else {
        const savedJob = await Job.findOne({
          jobId: id,
          source: jobData.source,
          'savedBy.user': req.user._id,
        }).lean();
        if (savedJob) {
          saveEntry = getUserSaveEntry(savedJob, req.user._id);
        }
      }
    }

    let noteCount = 0;
    if (req.user && saveEntry.isSaved) {
      noteCount = await Note.countDocuments({
        user: req.user._id,
        status: 'active',
        jobId: id,
      });
    }

    const { savedBy, __v, ...safeJobData } = jobData;
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
    const source = VALID_SOURCES.includes(req.body.source) ? req.body.source : 'nyc';

    let job = await Job.findOne({ jobId: id, source });

    if (!job) {
      if (source === 'federal') {
        try {
          const federalJob = await fetchUsaJobById(id);
          if (!federalJob) {
            return res.status(404).json({ message: 'Job not found in USAJobs API' });
          }
          job = new Job({ ...federalJob, source: 'federal' });
        } catch (usaError) {
          console.error('USAJobs API error during save:', usaError.message);
          return res.status(502).json({ message: 'Failed to fetch job from USAJobs API' });
        }
      } else {
        try {
          const response = await axios.get(`${process.env.NYC_JOBS_API_URL}?job_id=${encodeURIComponent(id)}`, {
            timeout: 10000,
          });

          const nycJobs = response.data;
          if (!nycJobs || nycJobs.length === 0) {
            return res.status(404).json({ message: 'Job not found in NYC API' });
          }

          job = new Job({ ...transformNycJob(nycJobs[0], { clean: true }), source: 'nyc' });
        } catch (fetchError) {
          console.error('NYC API fetch error during save:', fetchError.message);
          return res.status(502).json({
            message: 'Failed to fetch job from NYC API',
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

    const entry = getUserSaveEntry(job, req.user._id);
    const { savedBy: _sb, __v: _v, ...safeJob } = job.toObject();
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
    const source = VALID_SOURCES.includes(req.query.source) ? req.query.source : 'nyc';

    const job = await Job.findOne({ jobId: id, source });
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    job.savedBy = job.savedBy.filter((s) => s.user.toString() !== req.user._id.toString());

    if (job.savedBy.length === 0) {
      await job.deleteOne();
    } else {
      await job.save();
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
    body('documentLinks').optional().isArray({ max: 5 }),
    body('documentLinks.*.label').trim().isLength({ min: 1, max: 100 }),
    body('documentLinks.*.url').trim().isURL({ protocols: ['http', 'https'] }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
      }

      const { id } = req.params;
      const { applicationDate, interviewDate, followUpDate, documentLinks } = req.body;
      const source = VALID_SOURCES.includes(req.body.source) ? req.body.source : 'nyc';

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

      if (applicationDate !== undefined) entry.applicationDate = applicationDate;
      if (interviewDate !== undefined) entry.interviewDate = interviewDate;
      if (followUpDate !== undefined) entry.followUpDate = followUpDate;
      if (documentLinks !== undefined) entry.documentLinks = documentLinks;

      await job.save();

      res.json({
        message: 'Tracking info updated',
        applicationDate: entry.applicationDate,
        interviewDate: entry.interviewDate,
        followUpDate: entry.followUpDate,
        documentLinks: entry.documentLinks,
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
      const source = VALID_SOURCES.includes(req.body.source) ? req.body.source : 'nyc';

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
