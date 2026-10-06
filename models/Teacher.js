const mongoose = require('mongoose')

// Role profile for a teacher, separate from the auth record (User).
const teacherSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    // Fee manager: macalin ay admin-ku u ogolaaday inuu maamulo bogga Fees.
    // Role-kiisu weli waa 'teacher'; kani waa sifo dheeraad ah.
    isFeeManager: { type: Boolean, default: false },
  },
  { timestamps: true }
)

teacherSchema.index({ schoolId: 1, userId: 1 }, { unique: true })

module.exports = mongoose.model('Teacher', teacherSchema)
