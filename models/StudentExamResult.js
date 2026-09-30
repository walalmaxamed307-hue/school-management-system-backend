const mongoose = require('mongoose')

// A student's marks for one specific exam. One document per (enrollment,
// exam) with an embedded subject->marks map — the one deliberate embedding
// in this whole design, because the map is small, bounded, and always
// read/written as a unit (a teacher fills a whole class's marks for a whole
// exam at once). classId/sectionId are denormalized snapshots from the
// Enrollment at write time, so section-ranked result views don't need a
// join through Enrollment on every read.
const studentExamResultSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    marks: { type: Map, of: Number, default: {} }, // subjectId (string) -> mark
    maxMarkSnapshot: { type: Number, required: true },
    published: { type: Boolean, default: false },
    publishedAt: { type: Date },
    publishedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

studentExamResultSchema.index(
  { schoolId: 1, academicYearId: 1, enrollmentId: 1, examId: 1 },
  { unique: true }
)
studentExamResultSchema.index({ schoolId: 1, academicYearId: 1, examId: 1, classId: 1, sectionId: 1 })

module.exports = mongoose.model('StudentExamResult', studentExamResultSchema)
