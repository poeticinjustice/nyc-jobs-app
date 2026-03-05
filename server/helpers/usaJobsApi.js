const getUsaHeaders = () => ({
  'Authorization-Key': process.env.USAJOBS_API_KEY,
  'User-Agent': process.env.USAJOBS_EMAIL,
  Host: 'data.usajobs.gov',
});

module.exports = { getUsaHeaders };
