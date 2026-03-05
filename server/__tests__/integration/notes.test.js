const request = require('supertest');
const mongoose = require('mongoose');
const { setupDB } = require('../setup');
const app = require('../../app');
const {
  createTestUser,
  createAdminUser,
  createTestNote,
  authHeader,
} = require('../helpers/testHelpers');

setupDB();

describe('POST /api/notes', () => {
  it('creates a note and returns 201', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/notes')
      .set('Authorization', authHeader(token))
      .send({ title: 'My Note', content: 'Some content here' });

    expect(res.status).toBe(201);
    expect(res.body.note).toBeDefined();
    expect(res.body.note.title).toBe('My Note');
    expect(res.body.note.content).toBe('Some content here');
    expect(res.body.note.type).toBe('general');
    expect(res.body.note.priority).toBe('medium');
  });

  it('creates a note with a jobId', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/notes')
      .set('Authorization', authHeader(token))
      .send({ title: 'Job Note', content: 'Notes about this job', jobId: 'JOB-123' });

    expect(res.status).toBe(201);
    expect(res.body.note.jobId).toBe('JOB-123');
  });

  it('returns 400 for missing title', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/notes')
      .set('Authorization', authHeader(token))
      .send({ content: 'Content without title' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/validation/i);
  });

  it('returns 400 for missing content', async () => {
    const { token } = await createTestUser();

    const res = await request(app)
      .post('/api/notes')
      .set('Authorization', authHeader(token))
      .send({ title: 'Title without content' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/validation/i);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/notes')
      .send({ title: 'No Auth', content: 'No auth content' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/notes', () => {
  it('returns user notes with pagination', async () => {
    const { user, token } = await createTestUser();

    await createTestNote(user._id, { title: 'Note A' });
    await createTestNote(user._id, { title: 'Note B' });
    await createTestNote(user._id, { title: 'Note C' });

    const res = await request(app)
      .get('/api/notes')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(3);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.page).toBe(1);
  });

  it('filters by type', async () => {
    const { user, token } = await createTestUser();

    await createTestNote(user._id, { type: 'interview' });
    await createTestNote(user._id, { type: 'general' });
    await createTestNote(user._id, { type: 'interview' });

    const res = await request(app)
      .get('/api/notes?type=interview')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(2);
    res.body.notes.forEach((note) => {
      expect(note.type).toBe('interview');
    });
  });

  it('filters by priority', async () => {
    const { user, token } = await createTestUser();

    await createTestNote(user._id, { priority: 'high' });
    await createTestNote(user._id, { priority: 'low' });
    await createTestNote(user._id, { priority: 'high' });

    const res = await request(app)
      .get('/api/notes?priority=high')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(2);
    res.body.notes.forEach((note) => {
      expect(note.priority).toBe('high');
    });
  });

  it('only returns own notes, not other users notes', async () => {
    const { user: userA, token: tokenA } = await createTestUser();
    const { user: userB } = await createTestUser();

    await createTestNote(userA._id, { title: 'User A note' });
    await createTestNote(userB._id, { title: 'User B note' });

    const res = await request(app)
      .get('/api/notes')
      .set('Authorization', authHeader(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.notes[0].title).toBe('User A note');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/notes');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/notes/stats', () => {
  it('returns note statistics by type and priority', async () => {
    const { user, token } = await createTestUser();

    await createTestNote(user._id, { type: 'interview', priority: 'high' });
    await createTestNote(user._id, { type: 'interview', priority: 'low' });
    await createTestNote(user._id, { type: 'general', priority: 'high' });

    const res = await request(app)
      .get('/api/notes/stats')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.totalNotes).toBe(3);
    expect(res.body.byType).toBeDefined();
    expect(res.body.byPriority).toBeDefined();

    const interviewType = res.body.byType.find((s) => s._id === 'interview');
    expect(interviewType.count).toBe(2);

    const highPriority = res.body.byPriority.find((s) => s._id === 'high');
    expect(highPriority.count).toBe(2);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/notes/stats');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/notes/:id', () => {
  it('returns a note by ID', async () => {
    const { user, token } = await createTestUser();
    const note = await createTestNote(user._id, { title: 'Specific Note' });

    const res = await request(app)
      .get(`/api/notes/${note._id}`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.note).toBeDefined();
    expect(res.body.note.title).toBe('Specific Note');
  });

  it('returns 404 for non-existent note', async () => {
    const { token } = await createTestUser();
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .get(`/api/notes/${fakeId}`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(404);
  });

  it('returns 403 when accessing another user note', async () => {
    const { user: otherUser } = await createTestUser();
    const { token } = await createTestUser();
    const note = await createTestNote(otherUser._id, { title: 'Private Note' });

    const res = await request(app)
      .get(`/api/notes/${note._id}`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(403);
  });

  it('returns 401 without token', async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app).get(`/api/notes/${fakeId}`);

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/notes/:id', () => {
  it('updates title and content', async () => {
    const { user, token } = await createTestUser();
    const note = await createTestNote(user._id, { title: 'Old Title', content: 'Old content' });

    const res = await request(app)
      .put(`/api/notes/${note._id}`)
      .set('Authorization', authHeader(token))
      .send({ title: 'New Title', content: 'New content' });

    expect(res.status).toBe(200);
    expect(res.body.note.title).toBe('New Title');
    expect(res.body.note.content).toBe('New content');
  });

  it('returns 403 when updating another user note', async () => {
    const { user: otherUser } = await createTestUser();
    const { token } = await createTestUser();
    const note = await createTestNote(otherUser._id);

    const res = await request(app)
      .put(`/api/notes/${note._id}`)
      .set('Authorization', authHeader(token))
      .send({ title: 'Hacked Title' });

    expect(res.status).toBe(403);
  });

  it('returns 401 without token', async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .put(`/api/notes/${fakeId}`)
      .send({ title: 'No Auth' });

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/notes/:id', () => {
  it('soft-deletes a note by setting status to deleted', async () => {
    const { user, token } = await createTestUser();
    const note = await createTestNote(user._id, { title: 'To Delete' });

    const res = await request(app)
      .delete(`/api/notes/${note._id}`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);

    // Verify the note's status is now 'deleted' in the database
    const Note = require('../../models/Note');
    const deletedNote = await Note.findById(note._id);
    expect(deletedNote.status).toBe('deleted');
  });

  it('deleted note no longer appears in GET /api/notes', async () => {
    const { user, token } = await createTestUser();
    const note = await createTestNote(user._id, { title: 'Will Vanish' });

    // Confirm it appears initially
    let listRes = await request(app)
      .get('/api/notes')
      .set('Authorization', authHeader(token));
    expect(listRes.body.notes).toHaveLength(1);

    // Delete it
    await request(app)
      .delete(`/api/notes/${note._id}`)
      .set('Authorization', authHeader(token));

    // Confirm it no longer appears
    listRes = await request(app)
      .get('/api/notes')
      .set('Authorization', authHeader(token));
    expect(listRes.body.notes).toHaveLength(0);
  });

  it('returns 403 when deleting another user note', async () => {
    const { user: otherUser } = await createTestUser();
    const { token } = await createTestUser();
    const note = await createTestNote(otherUser._id);

    const res = await request(app)
      .delete(`/api/notes/${note._id}`)
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(403);
  });

  it('returns 401 without token', async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app).delete(`/api/notes/${fakeId}`);

    expect(res.status).toBe(401);
  });
});
