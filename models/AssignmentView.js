const mongoose = require('mongoose')

// Hal arday hal mar ayuu "arkay" ku noqon karaa post kasta. Diiwaankan
// wuxuu ka madax-bannaan yahay Assignment-ka si post-yadii hore aysan u
// jabin, isla markaana magacyada la arkay si ammaan ah loo soo celin karo.
const assignmentViewSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  },
  { timestamps: true }
)

assignmentViewSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true })
assignmentViewSchema.index({ schoolId: 1, assignmentId: 1, createdAt: -1 })

module.exports = mongoose.model('AssignmentView', assignmentViewSchema)
