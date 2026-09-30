const mongoose = require('mongoose')

// An academic year can contain multiple exams (First Term, Mid Term,
// Final...). Replaces the old hard-coded term enum. Exactly one exam per
// academic year should be flagged isFinal — enforced by a partial unique
// index below, at the database level, not just in application code.
const examSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    name: { type: String, required: true, trim: true }, // e.g. "First Term"
    order: { type: Number, required: true, default: 0 },
    isFinal: { type: Boolean, default: false },
    status: { type: String, required: true, enum: ['draft', 'open', 'closed'], default: 'draft' },
    // Snapshotted from SchoolSettings.defaultExamMaxMark at creation time.
    examMaxMarkSnapshot: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

examSchema.index({ schoolId: 1, academicYearId: 1, name: 1 }, { unique: true })
examSchema.index({ schoolId: 1, academicYearId: 1, order: 1 })
// Enforces "at most one final exam per academic year" at the DB level.
examSchema.index(
  { schoolId: 1, academicYearId: 1 },
  { unique: true, partialFilterExpression: { isFinal: true } }
)

module.exports = mongoose.model('Exam', examSchema)
