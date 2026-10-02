const mongoose = require('mongoose')

// Assignment (shaqo-guri) ee macalinku u dhigo fasal (iyo section ikhtiyaari)
// maado gaar ah. MAGACA "Homework" waa si aan loogu khaldin TeacherAssignment
// (kaas oo ah "macalinkan maxuu dhigaa"). Waxaa ku xiran sanadka active-ka ah:
// sanad cusub marka la bilaabo, ardaydu waxay arkaan kuwa sanadkaas kaliya.
const homeworkSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    // null = fasalka oo dhan (dhammaan sections-kiisa); set = hal section kaliya.
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', default: null },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    question: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  { timestamps: true }
)

// Ardayga: fasalkiisa (+ section) sanadka active-ka ah, kuwa ugu cusub.
homeworkSchema.index({ schoolId: 1, academicYearId: 1, classId: 1, createdAt: -1 })
// Macalinka: kuwa uu laftiisu qoray.
homeworkSchema.index({ schoolId: 1, teacherId: 1, createdAt: -1 })

module.exports = mongoose.model('Homework', homeworkSchema)
