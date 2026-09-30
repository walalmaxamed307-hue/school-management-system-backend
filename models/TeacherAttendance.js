const mongoose = require('mongoose')

// Teacher/staff attendance — a DIFFERENT thing from student Attendance.js,
// on purpose: a teacher isn't "enrolled" in a class/section, so there's no
// natural classId/sectionId to hang this off. This is a simple school-wide
// "did this staff member come to work today" record, one per teacher per
// day (no session split — that distinction is a student-timetable concept,
// not a staff one).
const teacherAttendanceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    date: { type: Date, required: true },
    status: { type: String, required: true, enum: ['present', 'absent', 'late', 'excused'] },
    markedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

teacherAttendanceSchema.index({ schoolId: 1, teacherId: 1, date: 1 }, { unique: true })
teacherAttendanceSchema.index({ schoolId: 1, teacherId: 1 })

module.exports = mongoose.model('TeacherAttendance', teacherAttendanceSchema)
