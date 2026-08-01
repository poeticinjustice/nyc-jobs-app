const mongoose = require('mongoose');
const { VALID_SOURCE_FILTERS } = require('../../shared/constants');

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
      // Mirrors the search endpoint, which accepts 'all' or a comma-separated
      // list of sources. A plain enum would reject "nyc,nys" and 500 the save.
      source: {
        type: String,
        default: 'all',
        validate: {
          validator: (v) =>
            typeof v === 'string' &&
            v.split(',').every((s) => VALID_SOURCE_FILTERS.includes(s.trim())),
          message: (props) => `${props.value} is not a valid source filter`,
        },
      },
    },
    // Alerting. newCount is derived on read (jobs added since lastSeenAt)
    // rather than stored, so it can never drift out of sync.
    alertsEnabled: {
      type: Boolean,
      default: false,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    lastNotifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

savedSearchSchema.index({ user: 1, createdAt: -1 });
savedSearchSchema.index({ alertsEnabled: 1 });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);
