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
    // Waxaa loo isticmaalaa keliya exam.hasParts=true. `marks` wuxuu sii
    // ahaanayaa natiijada kama-dambaysta ah (Part 1 + Part 2), si reports,
    // risk iyo promotion-kii hore aysan u jabin.
    partOneMarks: { type: Map, of: Number, default: {} },
    partTwoMarks: { type: Map, of: Number, default: {} },
    maxMarkSnapshot: { type: Number, required: true },
    published: { type: Boolean, default: false },
    // Split exam: 1 = Part 1 ayaa la publish-gareeyay, 2 = Part 1 + Part 2
    // ayaa la isku daray oo la publish-gareeyay. Exam caadi ah wuxuu sii
    // isticmaalaa `published` oo keliya (publishedPart=null).
    publishedPart: { type: Number, enum: [1, 2], default: null },
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
