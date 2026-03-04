// Realistic NYC Open Data API response (snake_case)
const nycApiJob = {
  job_id: '12345',
  business_title: 'Software Developer',
  civil_service_title: 'Computer Specialist',
  title_code_no: '10050',
  level: '02',
  job_category: 'Technology, Data &amp; Innovation',
  full_time_part_time_indicator: 'F',
  salary_range_from: '65000',
  salary_range_to: '95000',
  salary_frequency: 'Annual',
  work_location: 'Manhattan',
  work_location_1: '100 Church St., New York, NY',
  division_work_unit: 'DoITT',
  agency: 'Dept of Info Tech &amp; Telecomm',
  job_description: 'We are looking for a developer to build applications.',
  minimum_qual_requirements: 'Bachelor&rsquo;s degree in Computer Science',
  preferred_skills: 'JavaScript, React, Node.js',
  additional_information: 'Some additional info',
  to_apply: 'Apply online',
  hours_shift: '9am - 5pm',
  residency_requirement: 'NYC Residency Required',
  posting_date: '2025-01-15T00:00:00.000',
  process_date: '2025-01-20T00:00:00.000',
  post_until: '2025-03-15T00:00:00.000',
};

const nycApiJobsList = [
  { ...nycApiJob },
  {
    ...nycApiJob,
    job_id: '12346',
    business_title: 'Data Analyst',
    job_category: 'Policy, Research &amp; Analysis',
    salary_range_from: '55000',
    salary_range_to: '75000',
    agency: 'Dept of Health',
    work_location: 'Brooklyn',
    posting_date: '2025-02-01T00:00:00.000',
  },
  {
    ...nycApiJob,
    job_id: '12347',
    business_title: 'Project Manager',
    job_category: 'Administration &amp; Human Resources',
    salary_range_from: '80000',
    salary_range_to: '110000',
    agency: 'Dept of Education',
    work_location: 'Queens',
    posting_date: '2025-01-10T00:00:00.000',
  },
];

// Realistic USAJobs API response
const usaJobsSearchResultItem = {
  MatchedObjectId: 'USA-12345',
  MatchedObjectDescriptor: {
    PositionTitle: 'IT Specialist',
    PositionURI: 'https://www.usajobs.gov/job/USA-12345',
    ApplyURI: ['https://www.usajobs.gov/apply/USA-12345'],
    DepartmentName: 'Department of Homeland Security',
    OrganizationName: 'TSA',
    PositionLocationDisplay: 'New York, New York',
    PublicationStartDate: '2025-01-20',
    ApplicationCloseDate: '2025-03-20',
    PositionSchedule: [{ Name: 'Full-Time' }],
    JobGrade: [{ Code: 'GS-12' }],
    JobCategory: [{ Name: 'Information Technology' }],
    QualificationSummary: 'Must have IT experience...',
    PositionRemuneration: [{
      MinimumRange: '78000',
      MaximumRange: '101000',
      RateIntervalCode: 'PA',
    }],
    UserArea: {
      Details: {
        JobSummary: 'Responsible for IT systems and infrastructure.',
        MajorDuties: 'Manages networks and security.',
        Education: "Bachelor's degree required",
      },
    },
  },
};

const usaJobsSearchResponse = {
  SearchResult: {
    SearchResultCountAll: '150',
    SearchResultItems: [usaJobsSearchResultItem],
  },
};

module.exports = {
  nycApiJob,
  nycApiJobsList,
  usaJobsSearchResultItem,
  usaJobsSearchResponse,
};
