const mongoose = require('mongoose')

const schoolSettingsSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    defaultExamMaxMark: { type: Number, required: true, default: 100 },
    defaultPassMark: { type: Number, required: true, default: 50 },
    defaultStandardFeeAmount: { type: Number, required: true, default: 0 },
    // UI convenience pointer only — NOT the historical record. AcademicYear
    // documents remain the durable history regardless of what this points at.
    currentAcademicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
  },
  { timestamps: true }
)

schoolSettingsSchema.index({ schoolId: 1 }, { unique: true })

module.exports = mongoose.model('SchoolSettings', schoolSettingsSchema)
