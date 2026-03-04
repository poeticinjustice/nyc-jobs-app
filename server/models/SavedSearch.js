const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    criteria: {
      q: { type: String, default: '' },
      category: { type: String, default: '' },
      location: { type: String, default: '' },
      agency: { type: String, default: '' },
      salary_min: { type: String, default: '' },
      salary_max: { type: String, default: '' },
      sort: { type: String, default: 'date_desc' },
      source: { type: String, enum: ['nyc', 'federal', 'all'], default: 'all' },
    },
  },
  {
    timestamps: true,
  }
);

savedSearchSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);
