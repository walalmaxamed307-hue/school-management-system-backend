const mongoose = require('mongoose')

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

module.exports = mongoose.model('School', schoolSchema)
