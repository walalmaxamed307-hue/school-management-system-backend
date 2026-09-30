const mongoose = require('mongoose')

// Monthly school fee only — no fee-type complexity, per the approved
// decision. Keyed through enrollmentId, so the same student/month across
// two different academic years is structurally two separate records.
// classId/sectionId are denormalized snapshots from the Enrollment at
// write time (same pattern as Attendance and StudentExamResult), so a
// "Section A's fees this month" view doesn't need a join through
// Enrollment on every read.
const feeSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ }, // "YYYY-MM"
    amountDue: { type: Number, required: true },
    amountPaid: { type: Number, required: true, default: 0 },
    status: { type: String, required: true, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
    paidDate: { type: Date, default: null },
    recordedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

feeSchema.index({ schoolId: 1, enrollmentId: 1, month: 1 }, { unique: true })
feeSchema.index({ schoolId: 1, academicYearId: 1, status: 1 })
feeSchema.index({ schoolId: 1, academicYearId: 1, classId: 1, sectionId: 1, month: 1 })

module.exports = mongoose.model('Fee', feeSchema)
