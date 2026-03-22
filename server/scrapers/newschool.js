const refreshWorkdayJobs = require('./workday');

// ---------------------------------------------------------------------------
// The New School (Workday JSON API — uses shared refreshWorkdayJobs)
// ---------------------------------------------------------------------------

const refreshNewSchoolJobs = (timestamp) => refreshWorkdayJobs(timestamp, {
  name: 'New School',
  apiUrl: 'https://newschool.wd1.myworkdayjobs.com/wday/cxs/newschool/External/jobs',
  detailBaseUrl: 'https://newschool.wd1.myworkdayjobs.com/wday/cxs/newschool/External',
  publicBaseUrl: 'https://newschool.wd1.myworkdayjobs.com/External',
  source: 'newschool',
  agency: 'The New School',
});

module.exports = refreshNewSchoolJobs;
