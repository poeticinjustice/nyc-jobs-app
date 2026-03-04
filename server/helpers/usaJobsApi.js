const axios = require('axios');
const { transformUsaJob } = require('./jobHelpers');

const getUsaHeaders = () => ({
  'Authorization-Key': process.env.USAJOBS_API_KEY,
  'User-Agent': process.env.USAJOBS_EMAIL,
  Host: 'data.usajobs.gov',
});

// Simple TTL cache for individual job lookups
const jobByIdCache = new Map();
const JOB_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_JOB_CACHE_SIZE = 100;

// Fetch a single job from USAJobs by control number
const fetchUsaJobById = async (controlNumber) => {
  const cached = jobByIdCache.get(controlNumber);
  if (cached && Date.now() - cached.timestamp < JOB_CACHE_TTL) {
    // Move to end for LRU ordering
    jobByIdCache.delete(controlNumber);
    jobByIdCache.set(controlNumber, cached);
    return cached.data;
  }

  try {
    const response = await axios.get(
      `${process.env.USAJOBS_BASE_URL}?ControlNumber=${controlNumber}&Fields=Full`,
      { headers: getUsaHeaders(), timeout: 15000 }
    );
    const items = response.data.SearchResult?.SearchResultItems || [];
    if (items.length === 0) return null;
    const job = transformUsaJob(items[0]);

    if (jobByIdCache.size >= MAX_JOB_CACHE_SIZE) {
      const oldestKey = jobByIdCache.keys().next().value;
      jobByIdCache.delete(oldestKey);
    }
    jobByIdCache.set(controlNumber, { data: job, timestamp: Date.now() });

    return job;
  } catch (error) {
    console.error('USAJobs fetch by ID error:', error.message);
    return null;
  }
};

module.exports = { fetchUsaJobById, getUsaHeaders };
