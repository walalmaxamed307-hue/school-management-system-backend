const mongoose = require('mongoose')

// A subdivision within a Class/Grade (e.g. Grade 5 -> Section A). Persistent
// per (school, class) — NOT duplicated per academic year, same pattern as
// Class itself. Historical placement is captured by Enrollment.sectionId,
// not by this document being year-scoped.
const sectionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    name: { type: String, required: true, trim: true }, // e.g. "A" — no hard-coded set
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

// A section name is unique WITHIN its class, not school-wide — "A" can exist
// under both Grade 5 and Grade 6 as two separate Section documents.
sectionSchema.index({ schoolId: 1, classId: 1, name: 1 }, { unique: true })

module.exports = mongoose.model('Section', sectionSchema)
