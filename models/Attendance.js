const mongoose = require('mongoose')

// One record per student, per date, per session. Routes through
// enrollmentId (not raw studentId) so the class context an attendance
// record shows is permanently the class the student was actually in that
// day — never whatever their current class happens to be later.
// classId/sectionId are denormalized snapshots from the Enrollment at
// write time, for the highest-frequency, most latency-sensitive query in
// the system (a teacher opening "Grade 5 Section A, today").
const attendanceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    date: { type: Date, required: true },
    session: { type: String, required: true, enum: ['before_break', 'after_break'] },
    status: { type: String, required: true, enum: ['present', 'absent', 'late', 'excused'] },
    markedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    markedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

attendanceSchema.index({ schoolId: 1, enrollmentId: 1, date: 1, session: 1 }, { unique: true })
attendanceSchema.index({ schoolId: 1, academicYearId: 1, classId: 1, sectionId: 1, date: 1 })
attendanceSchema.index({ schoolId: 1, enrollmentId: 1 })

module.exports = mongoose.model('Attendance', attendanceSchema)
