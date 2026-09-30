const mongoose = require('mongoose')

// Role profile for a teacher, separate from the auth record (User).
const teacherSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

teacherSchema.index({ schoolId: 1, userId: 1 }, { unique: true })

module.exports = mongoose.model('Teacher', teacherSchema)
