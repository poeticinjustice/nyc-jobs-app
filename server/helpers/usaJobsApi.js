const axios = require('axios');
const { transformUsaJob } = require('./jobHelpers');

const USA_HEADERS = {
  'Authorization-Key': process.env.USAJOBS_API_KEY,
  'User-Agent': process.env.USAJOBS_EMAIL,
  Host: 'data.usajobs.gov',
};

// Fetch a single job from USAJobs by control number
const fetchUsaJobById = async (controlNumber) => {
  try {
    const response = await axios.get(
      `${process.env.USAJOBS_BASE_URL}?ControlNumber=${controlNumber}&Fields=Full`,
      { headers: USA_HEADERS, timeout: 15000 }
    );
    const items = response.data.SearchResult?.SearchResultItems || [];
    if (items.length === 0) return null;
    return transformUsaJob(items[0]);
  } catch (error) {
    console.error('USAJobs fetch by ID error:', error.message);
    return null;
  }
};

module.exports = { fetchUsaJobById };
