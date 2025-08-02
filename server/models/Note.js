const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ['general', 'interview', 'application', 'followup', 'research'],
      default: 'general',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 50,
      },
    ],
    attachments: [
      {
        filename: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
        size: {
          type: Number,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
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
noteSchema.index({ user: 1, job: 1 });
noteSchema.index({ user: 1, createdAt: -1 });
noteSchema.index({ type: 1 });
noteSchema.index({ priority: 1 });
noteSchema.index({ tags: 1 });

// Virtual for formatted creation date
noteSchema.virtual('formattedCreatedAt').get(function () {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});

// Virtual for formatted updated date
noteSchema.virtual('formattedUpdatedAt').get(function () {
  return this.updatedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});

// Method to get note summary (first 100 characters)
noteSchema.methods.getSummary = function () {
  return this.content.length > 100
    ? this.content.substring(0, 100) + '...'
    : this.content;
};

// Ensure virtual fields are serialized
noteSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Note', noteSchema);
