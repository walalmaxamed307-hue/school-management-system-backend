const mongoose = require('mongoose')

// The room allocation is term-wide. Attendance is a separate daily record,
// just like normal class attendance, so changing the date never requires a
// new room split.
const roomAttendanceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    status: { type: String, enum: ['present', 'absent'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

roomAttendanceSchema.index({ schoolId: 1, examId: 1, enrollmentId: 1, date: 1 }, { unique: true })
roomAttendanceSchema.index({ schoolId: 1, examId: 1, date: 1 })

module.exports = mongoose.model('RoomAttendance', roomAttendanceSchema)
