const mongoose = require('mongoose')
const Section = require('./Section')
const Class = require('./Class')
const Subject = require('./Subject')

// Which subject a teacher teaches in which class (optionally narrowed to
// one section), for a given year. Many-to-many, changes yearly. This is a
// TEACHING assignment — completely separate from attendance-marking
// permission (see TeacherAttendanceScope).
const teacherAssignmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    // null = assigned to the whole class (all its sections); set = assigned
    // to one specific section only.
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

teacherAssignmentSchema.pre('validate', async function validateRefs(next) {
  try {
    // Tenant isolation: fasalka iyo maadada waa in ay ka tirsan yihiin isla iskuulka.
    const [klass, subject] = await Promise.all([
      Class.findById(this.classId).select('schoolId'),
      Subject.findById(this.subjectId).select('schoolId'),
    ])
    if (!klass || String(klass.schoolId) !== String(this.schoolId)) {
      return next(new Error('classId does not belong to this assignment\'s schoolId'))
    }
    if (!subject || String(subject.schoolId) !== String(this.schoolId)) {
      return next(new Error('subjectId does not belong to this assignment\'s schoolId'))
    }

    if (!this.sectionId) return next()
    const section = await Section.findById(this.sectionId)
    if (!section) return next(new Error('sectionId does not reference an existing Section'))
    if (String(section.classId) !== String(this.classId)) {
      return next(new Error('sectionId does not belong to this assignment\'s classId'))
    }
    if (String(section.schoolId) !== String(this.schoolId)) {
      return next(new Error('sectionId does not belong to this assignment\'s schoolId'))
    }
    next()
  } catch (err) {
    next(err)
  }
})

teacherAssignmentSchema.index(
  { schoolId: 1, academicYearId: 1, teacherId: 1, classId: 1, sectionId: 1, subjectId: 1 },
  { unique: true }
)
teacherAssignmentSchema.index({ schoolId: 1, academicYearId: 1, classId: 1 })
teacherAssignmentSchema.index({ schoolId: 1, academicYearId: 1, teacherId: 1 })

module.exports = mongoose.model('TeacherAssignment', teacherAssignmentSchema)
