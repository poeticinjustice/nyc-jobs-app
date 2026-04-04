/**
 * Memorial Sloan Kettering Jobs (Workday JSON API — thin wrapper)
 */

const refreshWorkdayJobs = require('./workday');

const refreshMskJobs = (timestamp) => refreshWorkdayJobs(timestamp, {
  name: 'MSK',
  apiUrl: 'https://msk.wd108.myworkdayjobs.com/wday/cxs/msk/MSKCC_Careers_Primary/jobs',
  detailBaseUrl: 'https://msk.wd108.myworkdayjobs.com/wday/cxs/msk/MSKCC_Careers_Primary',
  publicBaseUrl: 'https://msk.wd108.myworkdayjobs.com/MSKCC_Careers_Primary',
  source: 'msk',
  agency: 'Memorial Sloan Kettering',
});

module.exports = refreshMskJobs;
