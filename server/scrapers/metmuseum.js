/**
 * Met Museum scraper — Workday JSON API (thin wrapper around shared refreshWorkdayJobs).
 */

const refreshWorkdayJobs = require('./workday');

const refreshMetMuseumJobs = (timestamp) => refreshWorkdayJobs(timestamp, {
  name: 'Met Museum',
  apiUrl: 'https://metmuseum.wd5.myworkdayjobs.com/wday/cxs/metmuseum/metmuseumcareers/jobs',
  detailBaseUrl: 'https://metmuseum.wd5.myworkdayjobs.com/wday/cxs/metmuseum/metmuseumcareers',
  publicBaseUrl: 'https://metmuseum.wd5.myworkdayjobs.com/metmuseumcareers',
  source: 'metmuseum',
  agency: 'The Metropolitan Museum of Art',
});

module.exports = refreshMetMuseumJobs;
