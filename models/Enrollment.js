const mongoose = require('mongoose')
const Section = require('./Section')
const Class = require('./Class')

// The central historical join: School -> AcademicYear -> Enrollment ->
// Student/Class/Section. This is what changes yearly — never the Student
// record itself. Once a year closes, an Enrollment is only ever touched
// once more (status + promotedToEnrollmentId set by the promotion
// workflow) and never mutated again after that.
const enrollmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    // Optional — a school may not have adopted sections yet, or a newly
    // admitted/promoted student may not be sorted into one yet.
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    status: {
      type: String,
      required: true,
      enum: ['active', 'promoted', 'repeated', 'graduated', 'transferred', 'withdrawn'],
      default: 'active',
    },
    finalExamTotalSnapshot: { type: Number },
    promotedToEnrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment' },
    enrolledAt: { type: Date, default: Date.now },
    finalizedAt: { type: Date },
  },
  { timestamps: false }
)

// Prevents "Section belonging to Grade 5 assigned to an enrollment for
// Grade 6" and "Section belonging to School A assigned in School B", AND
// enforces that a section is required exactly when the class has adopted
// sections — never optional-either-way. A class transitioning into
// sections (hasSections just flipped true, students not yet split) is the
// one case route-layer bulk-assignment logic must handle explicitly; this
// hook does not special-case it, so an enrollment written mid-transition
// without a sectionId is correctly rejected.
enrollmentSchema.pre('validate', async function validateSection(next) {
  try {
    const klass = await Class.findById(this.classId)
    if (!klass) return next(new Error('classId does not reference an existing Class'))
    if (String(klass.schoolId) !== String(this.schoolId)) {
      return next(new Error('classId does not belong to this enrollment\'s schoolId'))
    }

    if (klass.hasSections && !this.sectionId) {
      return next(new Error('sectionId is required because this class has sections'))
    }
    if (!klass.hasSections && this.sectionId) {
      return next(new Error('sectionId must not be set — this class has not adopted sections'))
    }
    if (!this.sectionId) return next()

    const section = await Section.findById(this.sectionId)
    if (!section) return next(new Error('sectionId does not reference an existing Section'))
    if (String(section.classId) !== String(this.classId)) {
      return next(new Error('sectionId does not belong to this enrollment\'s classId'))
    }
    if (String(section.schoolId) !== String(this.schoolId)) {
      return next(new Error('sectionId does not belong to this enrollment\'s schoolId'))
    }
    next()
  } catch (err) {
    next(err)
  }
})

enrollmentSchema.index({ schoolId: 1, academicYearId: 1, studentId: 1 }, { unique: true })
enrollmentSchema.index({ schoolId: 1, academicYearId: 1, classId: 1 })
enrollmentSchema.index({ schoolId: 1, academicYearId: 1, classId: 1, sectionId: 1 })

module.exports = mongoose.model('Enrollment', enrollmentSchema)
