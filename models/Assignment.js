const mongoose = require('mongoose')

// Files/casharro la geliyo waxay mar walba ka tirsan yihiin school + sanad.
const assignmentSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', default: null },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  title: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  kind: { type: String, enum: ['lesson', 'questions', 'other'], default: 'lesson' },
  dueDate: { type: Date, default: null },
  // File waa ikhtiyaari: lesson ama assignment qoraal keliya ah waa sax.
  file: { key: String, originalName: String, mimeType: String, size: Number },
  uploadedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedByName: { type: String, required: true },
}, { timestamps: true })
assignmentSchema.index({ schoolId: 1, academicYearId: 1, classId: 1, sectionId: 1, createdAt: -1 })
assignmentSchema.index({ schoolId: 1, uploadedByUserId: 1, createdAt: -1 })
module.exports = mongoose.model('Assignment', assignmentSchema)
