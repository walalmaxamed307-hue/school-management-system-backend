const mongoose = require('mongoose')
const Section = require('./Section')
const Class = require('./Class')

// The attendance-marking PERMISSION rule — and, as of this revision, also
// the authoritative identity of "who is the homeroom teacher (macalin
// horjoogo)" for a class/section. Those two things used to be treated as
// separable (multiple teachers could hold the same scope simultaneously,
// since a permission grant isn't proof of who teaches what). That no
// longer holds: a section has exactly one homeroom teacher, so scopeType
// 'single_class' is now unique per (schoolId, academicYearId, classId,
// sectionId) — see the partial unique index below. 'all_classes' is
// unaffected and still just a broad permission grant (a school admin
// covering attendance everywhere is not "the homeroom teacher of every
// class"), so it keeps its own uniqueness only via teacherId below.
//
// sectionId is OPTIONAL only when the class has not adopted sections
// (Class.hasSections === false); once a class has sections, a
// single_class scope on it MUST name one.
const teacherAttendanceScopeSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    scopeType: { type: String, required: true, enum: ['single_class', 'all_classes'] },
    // Required only when scopeType is 'single_class'; must be absent when
    // 'all_classes'.
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    // Optional even under single_class — null means "the whole class, all
    // its sections"; set means "this section only".
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
  },
  { timestamps: true }
)

teacherAttendanceScopeSchema.pre('validate', async function conditionalFields(next) {
  if (this.scopeType === 'single_class' && !this.classId) {
    return next(new Error('classId is required when scopeType is single_class'))
  }
  if (this.scopeType === 'all_classes') {
    if (this.classId) return next(new Error('classId must not be set when scopeType is all_classes'))
    if (this.sectionId) return next(new Error('sectionId must not be set when scopeType is all_classes'))
  }
  if (this.scopeType === 'single_class') {
    try {
      const klass = await Class.findById(this.classId)
      if (!klass) return next(new Error('classId does not reference an existing Class'))
      if (String(klass.schoolId) !== String(this.schoolId)) {
        return next(new Error('classId does not belong to this scope\'s schoolId'))
      }
      if (klass.hasSections && !this.sectionId) {
        return next(new Error('sectionId is required — this class has sections, so a homeroom scope must name one'))
      }
      if (!klass.hasSections && this.sectionId) {
        return next(new Error('sectionId must not be set — this class has not adopted sections'))
      }
    } catch (err) {
      return next(err)
    }
  }
  if (this.sectionId) {
    try {
      const section = await Section.findById(this.sectionId)
      if (!section) return next(new Error('sectionId does not reference an existing Section'))
      if (String(section.classId) !== String(this.classId)) {
        return next(new Error('sectionId does not belong to this scope\'s classId'))
      }
      if (String(section.schoolId) !== String(this.schoolId)) {
        return next(new Error('sectionId does not belong to this scope\'s schoolId'))
      }
    } catch (err) {
      return next(err)
    }
  }
  next()
})

teacherAttendanceScopeSchema.index({ schoolId: 1, academicYearId: 1, teacherId: 1 }, { unique: true })
// Exactly one homeroom teacher per class/section per year. Partial so it
// only applies to single_class docs — all_classes docs (classId/sectionId
// both unset) never enter this index and can't collide against it.
teacherAttendanceScopeSchema.index(
  { schoolId: 1, academicYearId: 1, classId: 1, sectionId: 1 },
  { unique: true, partialFilterExpression: { scopeType: 'single_class' } }
)

module.exports = mongoose.model('TeacherAttendanceScope', teacherAttendanceScopeSchema)
