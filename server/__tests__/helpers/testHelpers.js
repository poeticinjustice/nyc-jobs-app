const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Job = require('../../models/Job');
const Note = require('../../models/Note');
const SavedSearch = require('../../models/SavedSearch');

let counter = 0;

const createTestUser = async (overrides = {}) => {
  counter++;
  const userData = {
    email: `test-${Date.now()}-${counter}@example.com`,
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    isActive: true,
    ...overrides,
  };

  const user = new User(userData);
  await user.save();

  const token = jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { user, token };
};

const createAdminUser = async (overrides = {}) => {
  return createTestUser({ role: 'admin', ...overrides });
};

const createTestJob = async (overrides = {}) => {
  counter++;
  const jobData = {
    jobId: `test-job-${Date.now()}-${counter}`,
    source: 'nyc',
    businessTitle: 'Test Job Title',
    agency: 'Test Agency',
    jobCategory: 'Technology, Data & Innovation',
    workLocation: 'Manhattan',
    salaryRangeFrom: 50000,
    salaryRangeTo: 80000,
    salaryFrequency: 'Annual',
    jobDescription: 'Test job description content',
    postDate: new Date(),
    savedBy: [],
    ...overrides,
  };

  const job = new Job(jobData);
  await job.save();
  return job;
};

const createSavedJob = async (userId, overrides = {}) => {
  return createTestJob({
    savedBy: [{
      user: userId,
      savedAt: new Date(),
      applicationStatus: 'interested',
      statusUpdatedAt: new Date(),
      statusHistory: [{ status: 'interested', changedAt: new Date() }],
    }],
    ...overrides,
  });
};

const createTestNote = async (userId, overrides = {}) => {
  counter++;
  const noteData = {
    user: userId,
    title: `Test Note ${counter}`,
    content: 'Test note content',
    type: 'general',
    priority: 'medium',
    status: 'active',
    tags: [],
    ...overrides,
  };

  const note = new Note(noteData);
  await note.save();
  return note;
};

const createTestSearch = async (userId, overrides = {}) => {
  counter++;
  const searchData = {
    user: userId,
    name: `Test Search ${counter}`,
    criteria: {
      q: 'developer',
      category: '',
      location: '',
      agency: '',
      salary_min: '',
      salary_max: '',
      sort: 'date_desc',
    },
    ...overrides,
  };

  const search = new SavedSearch(searchData);
  await search.save();
  return search;
};

const authHeader = (token) => `Bearer ${token}`;

module.exports = {
  createTestUser,
  createAdminUser,
  createTestJob,
  createSavedJob,
  createTestNote,
  createTestSearch,
  authHeader,
};
