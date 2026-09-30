const mongoose = require('mongoose')

// The one deliberately cross-tenant collection — it exists specifically to
// bridge two School documents, so it necessarily stores two different
// schoolId values. Each school keeps its own Student record/history; a
// transfer creates a NEW Student in the destination school rather than
// moving the existing one. Must be handled through its own narrow,
// dedicated workflow — never through the general school-scoped query layer
// every other collection uses.
const studentTransferSchema = new mongoose.Schema(
  {
    fromSchoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    fromStudentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    toSchoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    // Nullable until the destination record is actually created.
    toStudentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    status: {
      type: String,
      required: true,
      enum: ['initiated', 'completed', 'cancelled'],
      default: 'initiated',
    },
    initiatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    completedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    initiatedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    notes: { type: String, trim: true },
  },
  { timestamps: false }
)

studentTransferSchema.index({ fromSchoolId: 1, fromStudentId: 1 })
studentTransferSchema.index({ toSchoolId: 1, toStudentId: 1 })

module.exports = mongoose.model('StudentTransfer', studentTransferSchema)
