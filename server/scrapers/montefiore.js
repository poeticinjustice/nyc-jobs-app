/**
 * Montefiore Health System Jobs (Workday JSON API — thin wrapper)
 */

const refreshWorkdayJobs = require('./workday');

const refreshMontefioreJobs = (timestamp) => refreshWorkdayJobs(timestamp, {
  name: 'Montefiore',
  apiUrl: 'https://montefiore.wd12.myworkdayjobs.com/wday/cxs/montefiore/MMC/jobs',
  detailBaseUrl: 'https://montefiore.wd12.myworkdayjobs.com/wday/cxs/montefiore/MMC',
  publicBaseUrl: 'https://montefiore.wd12.myworkdayjobs.com/MMC',
  source: 'montefiore',
  agency: 'Montefiore Health System',
});

module.exports = refreshMontefioreJobs;
