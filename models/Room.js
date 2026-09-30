const mongoose = require('mongoose')

const roomSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

roomSchema.index({ schoolId: 1, name: 1 }, { unique: true })

module.exports = mongoose.model('Room', roomSchema)
