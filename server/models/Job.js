const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    // NYC API fields
    jobId: {
      type: String,
      required: true,
      unique: true,
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
    recruitmentContact: {
      type: String,
      trim: true,
    },
    residencyRequirement: {
      type: String,
      trim: true,
    },
    postDate: {
      type: Date,
    },
    postUntil: {
      type: Date,
    },
    postUntilDate: {
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
      },
    ],

    // Search and categorization
    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    // Analytics
    viewCount: {
      type: Number,
      default: 0,
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
jobSchema.index({ businessTitle: 'text', jobDescription: 'text' });
jobSchema.index({ jobCategory: 1 });
jobSchema.index({ salaryRangeFrom: 1, salaryRangeTo: 1 });
jobSchema.index({ postDate: -1 });
jobSchema.index({ 'savedBy.user': 1 });

// Virtual for formatted salary range
jobSchema.virtual('formattedSalary').get(function () {
  if (this.salaryRangeFrom && this.salaryRangeTo) {
    return `$${this.salaryRangeFrom.toLocaleString()} - $${this.salaryRangeTo.toLocaleString()} ${
      this.salaryFrequency || ''
    }`;
  } else if (this.salaryRangeFrom) {
    return `$${this.salaryRangeFrom.toLocaleString()} ${
      this.salaryFrequency || ''
    }`;
  }
  return 'Salary not specified';
});

// Virtual for days since posted
jobSchema.virtual('daysSincePosted').get(function () {
  if (!this.postDate) return null;
  const now = new Date();
  const diffTime = Math.abs(now - this.postDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Ensure virtual fields are serialized
jobSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Job', jobSchema);
