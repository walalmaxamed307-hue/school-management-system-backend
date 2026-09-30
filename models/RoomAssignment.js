const mongoose = require('mongoose')

// Which room a student sits in for a specific exam sitting. Deliberately
// has NO section dimension — room allocation pools an entire Grade/Class
// together regardless of section, per the approved exception.
const roomAssignmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    examStatus: { type: String, enum: ['present', 'absent'], default: null },
    assignedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

roomAssignmentSchema.index({ schoolId: 1, examId: 1, enrollmentId: 1 }, { unique: true })
roomAssignmentSchema.index({ schoolId: 1, academicYearId: 1 })

module.exports = mongoose.model('RoomAssignment', roomAssignmentSchema)
