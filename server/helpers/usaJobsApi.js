const axios = require('axios');
const { transformUsaJob } = require('./jobHelpers');
const LRUCache = require('./LRUCache');

const getUsaHeaders = () => ({
  'Authorization-Key': process.env.USAJOBS_API_KEY,
  'User-Agent': process.env.USAJOBS_EMAIL,
  Host: 'data.usajobs.gov',
});

const jobByIdCache = new LRUCache(100, 10 * 60 * 1000);

// Fetch a single job from USAJobs by control number
// Returns { job } on success, { job: null } when not found, throws on API error
const fetchUsaJobById = async (controlNumber) => {
  const cached = jobByIdCache.get(controlNumber);
  if (cached) return cached;

  const response = await axios.get(
    `${process.env.USAJOBS_BASE_URL}?ControlNumber=${controlNumber}&Fields=Full`,
    { headers: getUsaHeaders(), timeout: 15000 }
  );
  const items = response.data.SearchResult?.SearchResultItems || [];
  if (items.length === 0) return null;
  const job = transformUsaJob(items[0]);

  if (job) jobByIdCache.set(controlNumber, job);
  return job;
};

module.exports = { fetchUsaJobById, getUsaHeaders };
