const mongoose = require('mongoose');
const { NOTE_TYPE_VALUES, NOTE_PRIORITY_VALUES, NOTE_TITLE_MAX, NOTE_CONTENT_MAX } = require('../../shared/constants');

const noteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    jobId: {
      type: String,
      required: false,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: NOTE_TITLE_MAX,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: NOTE_CONTENT_MAX,
    },
    type: {
      type: String,
      enum: NOTE_TYPE_VALUES,
      default: 'general',
    },
    priority: {
      type: String,
      enum: NOTE_PRIORITY_VALUES,
      default: 'medium',
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 50,
      },
    ],
    status: {
      type: String,
      enum: ['active', 'archived', 'deleted'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
noteSchema.index({ user: 1, status: 1, jobId: 1 });
noteSchema.index({ user: 1, status: 1, createdAt: -1 });
noteSchema.index({ user: 1, status: 1, type: 1 });
noteSchema.index({ user: 1, status: 1, priority: 1 });

module.exports = mongoose.model('Note', noteSchema);
