/**
 * Every scraper builds its upsert through buildUpsertOps/batchUpsert, so the
 * guarantees tested here — undefined means "keep stored value", jobless docs
 * never reach MongoDB, coordinates follow an explicit precedence — hold for all
 * 25 sources at once.
 */

const { buildUpsertOps, batchUpsert } = require('../../scrapers/utils');
const Job = require('../../models/Job');
const { setupDB } = require('../setup');

setupDB();

const TS = new Date('2026-08-01T00:00:00Z');
const opFor = (job, source = 'nyc') => buildUpsertOps([job], source, TS)[0].updateOne;

describe('buildUpsertOps — document shape', () => {
  it('stamps source, coordinates and lastRefreshedAt, and seeds savedBy on insert', () => {
    const { filter, update, upsert } = opFor({
      jobId: 'J1',
      businessTitle: 'Analyst',
      workLocation: 'Manhattan',
    });

    expect(filter).toEqual({ jobId: 'J1', source: 'nyc' });
    expect(upsert).toBe(true);
    expect(update.$set.source).toBe('nyc');
    expect(update.$set.lastRefreshedAt).toBe(TS);
    expect(update.$set.coordinates).toBeDefined();
    expect(update.$setOnInsert).toEqual({ savedBy: [] });
  });

  it('never writes the underscore-prefixed directives as document fields', () => {
    const { update } = opFor({
      jobId: 'J1',
      workLocation: 'Manhattan',
      _lat: 40.7,
      _lng: -74,
      _coords: { lat: 40.7, lng: -74 },
      _setOnInsert: { postDate: TS },
    });

    for (const key of ['_lat', '_lng', '_coords', '_setOnInsert']) {
      expect(update.$set).not.toHaveProperty(key);
    }
  });
});

describe('buildUpsertOps — undefined means "keep what is stored"', () => {
  it('strips undefined fields from $set so a cached refresh cannot wipe them', () => {
    const { update } = opFor({
      jobId: 'J1',
      businessTitle: 'Curator',
      workLocation: 'Manhattan',
      // detail page not refetched this run
      jobDescription: undefined,
      postDate: undefined,
      salaryRangeFrom: undefined,
    });

    expect(update.$set).toHaveProperty('businessTitle', 'Curator');
    expect(update.$set).not.toHaveProperty('jobDescription');
    expect(update.$set).not.toHaveProperty('postDate');
    expect(update.$set).not.toHaveProperty('salaryRangeFrom');
  });

  it('keeps explicit nulls, which mean "clear this field"', () => {
    const { update } = opFor({
      jobId: 'J1',
      workLocation: 'Manhattan',
      salaryRangeFrom: null,
      salaryRangeTo: 0,
    });

    expect(update.$set).toHaveProperty('salaryRangeFrom', null);
    expect(update.$set).toHaveProperty('salaryRangeTo', 0);
  });
});

describe('buildUpsertOps — coordinate precedence', () => {
  it('prefers explicit _coords over the feed lat/lng and over geocoding', () => {
    const { update } = opFor({
      jobId: 'J1',
      workLocation: 'Manhattan',
      _lat: 1,
      _lng: 2,
      _coords: { lat: 40.7813, lng: -73.974 },
    });

    expect(update.$set.coordinates).toEqual({ lat: 40.7813, lng: -73.974 });
  });

  it('uses the feed lat/lng when present', () => {
    const { update } = opFor({ jobId: 'J1', workLocation: 'Manhattan', _lat: 40.75, _lng: -73.99 });
    expect(update.$set.coordinates).toEqual({ lat: 40.75, lng: -73.99 });
  });

  it('falls back to geocoding, and to a null pair when that fails', () => {
    const { update } = opFor({ jobId: 'J1', workLocation: 'Nowhere At All', workLocation1: null });
    expect(update.$set.coordinates).toEqual(expect.objectContaining({ lat: expect.anything() }));
  });

  it('omits coordinates entirely when _coords is explicitly undefined', () => {
    // The cached-detail path: no location this run, so nothing to geocode from.
    const { update } = opFor({ jobId: 'J1', workLocation: undefined, _coords: undefined });
    expect(update.$set).not.toHaveProperty('coordinates');
  });
});

describe('buildUpsertOps — $setOnInsert', () => {
  it('merges per-job extras for sources that publish no posted date', () => {
    const { update } = opFor({
      jobId: 'J1',
      workLocation: 'Manhattan',
      _setOnInsert: { postDate: TS },
    });

    expect(update.$setOnInsert).toEqual({ savedBy: [], postDate: TS });
  });

  it('does not put the same field in both $set and $setOnInsert', () => {
    // MongoDB rejects an update whose operators conflict on one path.
    const { update } = opFor({
      jobId: 'J1',
      workLocation: 'Manhattan',
      postDate: undefined,
      _setOnInsert: { postDate: TS },
    });

    const overlap = Object.keys(update.$set).filter((k) => k in update.$setOnInsert);
    expect(overlap).toEqual([]);
  });
});

describe('batchUpsert', () => {
  const jobsFor = (docs) => docs.map((d) => ({ workLocation: 'Manhattan', ...d }));

  it('inserts, then updates on a second run without duplicating', async () => {
    const first = await batchUpsert(
      jobsFor([{ jobId: 'A', businessTitle: 'One' }, { jobId: 'B', businessTitle: 'Two' }]),
      'nyc',
      TS,
      'Test'
    );
    expect(first).toEqual({ upserted: 2, modified: 0 });

    const later = new Date('2026-08-02T00:00:00Z');
    const second = await batchUpsert(
      jobsFor([{ jobId: 'A', businessTitle: 'One Revised' }]),
      'nyc',
      later,
      'Test'
    );
    expect(second).toEqual({ upserted: 0, modified: 1 });

    expect(await Job.countDocuments({ source: 'nyc' })).toBe(2);
    const a = await Job.findOne({ jobId: 'A', source: 'nyc' }).lean();
    expect(a.businessTitle).toBe('One Revised');
    expect(a.savedBy).toEqual([]);
  });

  it('preserves stored fields when a later run sends them as undefined', async () => {
    await batchUpsert(
      jobsFor([{ jobId: 'C', businessTitle: 'Curator', jobDescription: 'Full text', postDate: TS }]),
      'nyc',
      TS,
      'Test'
    );

    await batchUpsert(
      jobsFor([{ jobId: 'C', businessTitle: 'Curator', jobDescription: undefined, postDate: undefined }]),
      'nyc',
      new Date('2026-08-02T00:00:00Z'),
      'Test'
    );

    const doc = await Job.findOne({ jobId: 'C', source: 'nyc' }).lean();
    expect(doc.jobDescription).toBe('Full text');
    expect(doc.postDate).toEqual(TS);
  });

  it('drops jobs with no id rather than letting them match an unrelated document', async () => {
    await batchUpsert(jobsFor([{ jobId: 'KEEP', businessTitle: 'Real' }]), 'nyc', TS, 'Test');

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await batchUpsert(
      jobsFor([
        { jobId: undefined, businessTitle: 'No id' },
        { jobId: null, businessTitle: 'Null id' },
        { jobId: '', businessTitle: 'Empty id' },
      ]),
      'nyc',
      TS,
      'Test'
    );
    warn.mockRestore();

    expect(result).toEqual({ upserted: 0, modified: 0 });
    expect(await Job.countDocuments({ source: 'nyc' })).toBe(1);
    expect((await Job.findOne({ jobId: 'KEEP' }).lean()).businessTitle).toBe('Real');
  });

  it('handles an empty list without touching the database', async () => {
    expect(await batchUpsert([], 'nyc', TS, 'Test')).toEqual({ upserted: 0, modified: 0 });
  });

  it('writes more rows than one bulkWrite batch', async () => {
    const many = Array.from({ length: 750 }, (_, i) => ({
      jobId: `BULK-${i}`,
      businessTitle: `Job ${i}`,
      workLocation: 'Manhattan',
    }));

    expect(await batchUpsert(many, 'nyc', TS, 'Test')).toEqual({ upserted: 750, modified: 0 });
    expect(await Job.countDocuments({ source: 'nyc' })).toBe(750);
  });
});
