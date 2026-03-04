const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

const setupDB = () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
    process.env.NYC_JOBS_API_URL = 'https://data.cityofnewyork.us/resource/kpav-sd4t.json';
    process.env.USAJOBS_API_KEY = 'test-api-key';
    process.env.USAJOBS_EMAIL = 'test@example.com';
    process.env.USAJOBS_BASE_URL = 'https://data.usajobs.gov/api/Search';
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_MAX_REQUESTS = '10000';
  });

  afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongod.stop();
  });
};

module.exports = { setupDB };
