const mongoose = require('mongoose')

// Global — intentionally NOT school-scoped. Kept as its own collection so
// "super-admin, no tenant" is a structural fact rather than a nullable
// schoolId sitting inside the tenant-scoped User collection.
const platformAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

platformAdminSchema.index({ email: 1 }, { unique: true })

module.exports = mongoose.model('PlatformAdmin', platformAdminSchema)
