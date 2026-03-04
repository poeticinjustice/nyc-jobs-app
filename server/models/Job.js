const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: ['nyc', 'federal'],
      default: 'nyc',
    },
    externalUrl: {
      type: String,
      trim: true,
    },
    businessTitle: {
      type: String,
      required: true,
      trim: true,
    },
    civilServiceTitle: {
      type: String,
      trim: true,
    },
    titleCodeNo: {
      type: String,
      trim: true,
    },
    level: {
      type: String,
      trim: true,
    },
    jobCategory: {
      type: String,
      trim: true,
    },
    fullTimePartTimeIndicator: {
      type: String,
      trim: true,
    },
    salaryRangeFrom: {
      type: Number,
    },
    salaryRangeTo: {
      type: Number,
    },
    salaryFrequency: {
      type: String,
      trim: true,
    },
    workLocation: {
      type: String,
      trim: true,
    },
    divisionWorkUnit: {
      type: String,
      trim: true,
    },
    jobDescription: {
      type: String,
      trim: true,
    },
    minimumQualRequirements: {
      type: String,
      trim: true,
    },
    preferredSkills: {
      type: String,
      trim: true,
    },
    additionalInformation: {
      type: String,
      trim: true,
    },
    toApply: {
      type: String,
      trim: true,
    },
    hoursShift: {
      type: String,
      trim: true,
    },
    workLocation1: {
      type: String,
      trim: true,
    },
    residencyRequirement: {
      type: String,
      trim: true,
    },
    agency: {
      type: String,
      trim: true,
    },
    postDate: {
      type: Date,
    },
    postUntil: {
      type: Date,
    },
    processDate: {
      type: Date,
    },

    // App-specific fields
    savedBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        savedAt: {
          type: Date,
          default: Date.now,
        },
        applicationStatus: {
          type: String,
          enum: ['interested', 'applied', 'interviewing', 'offered', 'rejected'],
          default: 'interested',
        },
        statusUpdatedAt: {
          type: Date,
          default: Date.now,
        },
        statusHistory: [
          {
            status: {
              type: String,
              enum: ['interested', 'applied', 'interviewing', 'offered', 'rejected'],
            },
            changedAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
jobSchema.index({ jobId: 1, source: 1 }, { unique: true });
jobSchema.index({ 'savedBy.user': 1, jobId: 1 });
jobSchema.index({ jobCategory: 1 });
jobSchema.index({ salaryRangeFrom: 1, salaryRangeTo: 1 });
jobSchema.index({ postDate: -1 });
jobSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Job', jobSchema);
