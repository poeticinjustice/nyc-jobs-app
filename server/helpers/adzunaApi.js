const axios = require('axios');
const { transformAdzunaJob } = require('./jobHelpers');

// LRU search cache
const searchCache = new Map();
const SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_SEARCH_CACHE_SIZE = 50;

// Individual job cache (populated from search results)
const jobCache = new Map();
const JOB_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_JOB_CACHE_SIZE = 200;

// Map our sort params to Adzuna sort_by values
const SORT_MAP = {
  date_desc: 'date',
  date_asc: 'date',
  salary_desc: 'salary',
  salary_asc: 'salary',
  title_asc: 'relevance',
  title_desc: 'relevance',
};

// Search Adzuna jobs with caching
const fetchAdzunaJobs = async ({ q, location, category, salary_min, salary_max, sort = 'date_desc', page = 1, limit = 20 }) => {
  const cacheKey = JSON.stringify(['adzuna', q || '', location || '', category || '', salary_min || '', salary_max || '', sort, page, limit]);
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL) {
    searchCache.delete(cacheKey);
    searchCache.set(cacheKey, cached);
    return cached.data;
  }

  const pageNum = parseInt(page) || 1;
  const resultsPerPage = Math.min(parseInt(limit) || 20, 50); // Adzuna max is 50

  const params = new URLSearchParams();
  params.append('app_id', process.env.ADZUNA_APP_ID);
  params.append('app_key', process.env.ADZUNA_APP_KEY);
  params.append('results_per_page', String(resultsPerPage));
  params.append('content-type', 'application/json');

  // Combine keyword and category into 'what' param
  const whatParts = [q, category].filter(Boolean);
  if (whatParts.length > 0) {
    params.append('what', whatParts.join(' '));
  }

  if (location) {
    params.append('where', location);
  }

  if (salary_min) params.append('salary_min', salary_min);
  if (salary_max) params.append('salary_max', salary_max);

  const sortBy = SORT_MAP[sort] || 'date';
  params.append('sort_by', sortBy);

  try {
    const response = await axios.get(
      `${process.env.ADZUNA_BASE_URL}/jobs/us/search/${pageNum}?${params.toString()}`,
      { timeout: 15000 }
    );

    const results = response.data.results || [];
    const totalCount = response.data.count || 0;

    let jobs = results.map(transformAdzunaJob).filter(Boolean);

    // Cache individual jobs by ID for detail page lookups
    for (const job of jobs) {
      if (job.jobId) {
        if (jobCache.size >= MAX_JOB_CACHE_SIZE) {
          const oldestKey = jobCache.keys().next().value;
          jobCache.delete(oldestKey);
        }
        jobCache.set(job.jobId, { data: job, timestamp: Date.now() });
      }
    }

    // Adzuna doesn't support reverse sort — handle client-side for asc variants
    if (sort === 'date_asc') {
      jobs.reverse();
    } else if (sort === 'salary_asc') {
      jobs.reverse();
    }

    const result = { jobs, total: totalCount };

    // Cache with LRU eviction
    if (searchCache.size >= MAX_SEARCH_CACHE_SIZE) {
      const oldestKey = searchCache.keys().next().value;
      searchCache.delete(oldestKey);
    }
    searchCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return result;
  } catch (error) {
    console.error('Adzuna API error:', error.message);
    return { jobs: [], total: 0 };
  }
};

// Look up a single Adzuna job from the in-memory cache
const getAdzunaJobById = (jobId) => {
  const cached = jobCache.get(jobId);
  if (cached && Date.now() - cached.timestamp < JOB_CACHE_TTL) {
    return cached.data;
  }
  if (cached) jobCache.delete(jobId);
  return null;
};

// Clean expired cache entries (called from jobs route setInterval)
const cleanSearchCache = () => {
  const now = Date.now();
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > SEARCH_CACHE_TTL) {
      searchCache.delete(key);
    }
  }
  for (const [key, value] of jobCache.entries()) {
    if (now - value.timestamp > JOB_CACHE_TTL) {
      jobCache.delete(key);
    }
  }
};

module.exports = { fetchAdzunaJobs, getAdzunaJobById, cleanSearchCache };
