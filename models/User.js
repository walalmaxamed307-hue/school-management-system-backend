const mongoose = require('mongoose')

// Auth identity for school STAFF only (admin, teacher). Deliberately thin —
// role-specific profile data lives in Teacher, not here. Students are NOT
// modeled as User (see Student.js) — their auth mechanism is a separate,
// still-open decision and must not block this schema layer.
//
// name is required ONLY for admin — an admin has no separate profile doc
// (unlike Teacher, which owns fullName as the authoritative display name).
// For a teacher-role User, this field must stay unset; Teacher.fullName is
// the single source of truth for a teacher's display name, so writing a
// name here too would create the exact same two-places-for-one-fact drift
// already flagged between School and SchoolSettings.
const userSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    // 'owner' = milkiilaha iskuulka: akoon READ-ONLY oo email+password kaliya leh
    // (name lama rabo). Wuxuu arkaa kaliya /owner/overview (dashboard-ka milkiilaha).
    role: { type: String, required: true, enum: ['admin', 'teacher', 'owner'] },
    name: {
      type: String,
      trim: true,
      required: function requiredForAdmin() {
        return this.role === 'admin'
      },
      // A plain field validator (not a pre('validate') hook) on purpose —
      // validateSync() runs schema-type validators like this one, but it
      // skips pre('validate') hooks entirely. Since this rule needs no DB
      // lookup, it belongs here so it's actually exercised by the fast
      // synchronous test suite instead of silently never running under it.
      validate: {
        validator: function forbidNameOnTeacher(v) {
          return !(this.role === 'teacher' && v)
        },
        message: 'name must not be set on a teacher User — use Teacher.fullName instead',
      },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

// Email is GLOBALLY unique. Login is by email alone (no school selector),
// so the same email at two schools would make login ambiguous — one
// person could land in the wrong school's data. One email = one account.
userSchema.index({ email: 1 }, { unique: true })

module.exports = mongoose.model('User', userSchema)
