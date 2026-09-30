const mongoose = require('mongoose')

const subjectSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

subjectSchema.index({ schoolId: 1, name: 1 }, { unique: true })

module.exports = mongoose.model('Subject', subjectSchema)
