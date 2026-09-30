const mongoose = require('mongoose')

// Persistent per school — NOT duplicated per year. "Grade 5" doesn't change
// yearly; who's in it does (that's Enrollment).
//
// hasSections is an explicit admin decision, not something inferred from
// whether Section documents happen to exist. This matters for the
// "class grows and gets split into sections later" workflow: an admin
// flips this to true FIRST, then creates Section docs (A/B/C...), then
// bulk-reassigns existing Enrollments into them — there is a real window
// where hasSections=true but not every enrollment has a sectionId yet.
// Once true, it gates a requirement everywhere sectionId matters
// (Enrollment, TeacherAttendanceScope): section becomes mandatory there.
// It must never be flipped back to false while any Section under this
// Class is referenced by an Enrollment — that check lives in the route
// layer, not here, since it requires cross-collection lookups Mongoose
// validators shouldn't own.
const classSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true }, // e.g. "Grade 5"
    level: { type: Number, required: true }, // real, sortable ordering field
    hasSections: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

classSchema.index({ schoolId: 1, name: 1 }, { unique: true })
classSchema.index({ schoolId: 1, level: 1 })

module.exports = mongoose.model('Class', classSchema)
