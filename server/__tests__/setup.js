const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

const setupDB = () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    // Ensure all model indexes (including text indexes) are created
    const Job = require('../models/Job');
    await Job.createIndexes();

    // Env vars live in setupEnv.js — they must be set before app.js is
    // imported, which is too early for this hook.
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
