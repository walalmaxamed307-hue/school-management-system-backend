const mongoose = require('mongoose')

// School-wide, confirmed NOT dependent on an academic year.
const announcementSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    eventDate: { type: Date, default: null },
    authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorRoleSnapshot: { type: String, required: true, enum: ['admin', 'teacher'] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

announcementSchema.index({ schoolId: 1, createdAt: -1 })
announcementSchema.index({ schoolId: 1, eventDate: 1 })

module.exports = mongoose.model('Announcement', announcementSchema)
