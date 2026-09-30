const mongoose = require('mongoose')

// The historical anchor. A persistent record, never a mutable setting.
// Once status becomes 'closed', nothing about this document (or anything
// linked to it via academicYearId) should be edited again except by the
// promotion workflow's own controlled writes (see PromotionRecommendation).
const academicYearSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    startYear: { type: Number, required: true },
    endYear: { type: Number, required: true },
    label: { type: String, required: true, trim: true }, // e.g. "2025-2026"
    status: {
      type: String,
      required: true,
      enum: ['upcoming', 'active', 'closed'],
      default: 'upcoming',
    },
    // Snapshotted from SchoolSettings at creation time, so a later change to
    // the school's defaults never reinterprets a closed year's history.
    passMarkSnapshot: { type: Number, required: true },
    examMaxMarkSnapshot: { type: Number, required: true },
    closedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

academicYearSchema.index({ schoolId: 1, startYear: 1 }, { unique: true })

module.exports = mongoose.model('AcademicYear', academicYearSchema)
