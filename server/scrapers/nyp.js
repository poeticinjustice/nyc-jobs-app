/**
 * NewYork-Presbyterian Jobs (Workday JSON API — thin wrapper)
 */

const refreshWorkdayJobs = require('./workday');

const refreshNypJobs = (timestamp) => refreshWorkdayJobs(timestamp, {
  name: 'NYP',
  apiUrl: 'https://nyp.wd1.myworkdayjobs.com/wday/cxs/nyp/nypcareers/jobs',
  detailBaseUrl: 'https://nyp.wd1.myworkdayjobs.com/wday/cxs/nyp/nypcareers',
  publicBaseUrl: 'https://nyp.wd1.myworkdayjobs.com/nypcareers',
  source: 'nyp',
  agency: 'NewYork-Presbyterian',
});

module.exports = refreshNypJobs;
