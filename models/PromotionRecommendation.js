const mongoose = require('mongoose')

// Enforces that promotion/repetition/graduation is never finalized
// automatically. The system computes and stores a RECOMMENDATION; nothing
// about a student's Enrollment or lifecycleStatus changes until an admin
// explicitly confirms (optionally overriding the system's outcome first).
// Workflow: compute (pending_review) -> review/override -> confirm
// (confirmed) -> apply (applied, the actual Enrollment writes happen).
const promotionRecommendationSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true }, // the closing year
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    finalExamResultId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentExamResult' },
    computedTotal: { type: Number, required: true },
    passMarkSnapshot: { type: Number, required: true },
    systemRecommendation: { type: String, required: true, enum: ['promote', 'repeat', 'graduate'] },
    adminOverrideOutcome: { type: String, enum: ['promote', 'repeat', 'graduate'], default: null },
    finalOutcome: { type: String, enum: ['promote', 'repeat', 'graduate'], default: null },
    status: {
      type: String,
      required: true,
      enum: ['pending_review', 'confirmed', 'applied'],
      default: 'pending_review',
    },
    confirmedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: { type: Date },
    appliedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

promotionRecommendationSchema.index({ schoolId: 1, academicYearId: 1, enrollmentId: 1 }, { unique: true })
promotionRecommendationSchema.index({ schoolId: 1, academicYearId: 1, status: 1 })

module.exports = mongoose.model('PromotionRecommendation', promotionRecommendationSchema)
