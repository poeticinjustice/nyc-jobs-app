// Application status values (used by Mongoose enum and validators)
const APPLICATION_STATUS_VALUES = ['interested', 'applied', 'interviewing', 'offered', 'rejected'];

// Application status objects with labels (no Tailwind colors — those are UI-specific)
const APPLICATION_STATUSES = [
  { value: 'interested', label: 'Interested' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'rejected', label: 'Rejected' },
];

// Valid job sources for DB storage
const JOB_SOURCES = ['nyc', 'federal', 'nys'];

// Source filter options including 'all' (used in search UI and validators)
const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Jobs' },
  { value: 'nyc', label: 'City' },
  { value: 'federal', label: 'Federal' },
  { value: 'nys', label: 'State' },
];

// All valid source filter values (JOB_SOURCES + 'all')
const VALID_SOURCE_FILTERS = ['nyc', 'federal', 'nys', 'all'];

// Sort options with labels
const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Most Recent First' },
  { value: 'date_asc', label: 'Oldest First' },
  { value: 'title_asc', label: 'Title A-Z' },
  { value: 'title_desc', label: 'Title Z-A' },
  { value: 'salary_desc', label: 'Highest Salary First' },
  { value: 'salary_asc', label: 'Lowest Salary First' },
];

// Sort values array (for express-validator isIn checks)
const SORT_VALUES = SORT_OPTIONS.map((o) => o.value);

// Note types and priorities (used by Mongoose enum and validators)
const NOTE_TYPE_VALUES = ['general', 'interview', 'application', 'followup', 'research'];
const NOTE_PRIORITY_VALUES = ['low', 'medium', 'high', 'urgent'];

// User roles (used by Mongoose enum and validators)
const USER_ROLE_VALUES = ['user', 'admin', 'moderator'];

// Validation limits (shared between client validators and server express-validator rules)
const NAME_MAX = 50;
const PASSWORD_MIN = 6;
const NOTE_TITLE_MAX = 200;
const NOTE_CONTENT_MAX = 5000;
const SEARCH_NAME_MAX = 100;
const DOC_LINK_MAX = 5;
const DOC_LABEL_MAX = 100;

module.exports = {
  APPLICATION_STATUS_VALUES,
  APPLICATION_STATUSES,
  JOB_SOURCES,
  SOURCE_OPTIONS,
  VALID_SOURCE_FILTERS,
  SORT_OPTIONS,
  SORT_VALUES,
  NAME_MAX,
  PASSWORD_MIN,
  NOTE_TITLE_MAX,
  NOTE_CONTENT_MAX,
  SEARCH_NAME_MAX,
  DOC_LINK_MAX,
  DOC_LABEL_MAX,
  NOTE_TYPE_VALUES,
  NOTE_PRIORITY_VALUES,
  USER_ROLE_VALUES,
};
