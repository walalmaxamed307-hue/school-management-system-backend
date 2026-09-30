const { Exam, AcademicYear, SchoolSettings, StudentExamResult, RoomAssignment } = require('../models')

async function list(req, res) {
  const academicYearId = req.query.academicYearId
    ? req.query.academicYearId
    : (await AcademicYear.findOne({ schoolId: req.user.schoolId, status: 'active' }))?._id
  if (!academicYearId) return res.json([])

  const exams = await Exam.find({ schoolId: req.user.schoolId, academicYearId }).sort({ order: 1 })
  res.json(exams)
}

// name IS the term (e.g. "Term 1", "Term 2", "Final Exam") — matches how
// the frontend already treats exams/terms as the same concept.
async function create(req, res) {
  const { name, order, isFinal } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })

  const activeYear = await AcademicYear.findOne({ schoolId: req.user.schoolId, status: 'active' })
  if (!activeYear) return res.status(400).json({ error: 'No active academic year' })

  const settings = await SchoolSettings.findOne({ schoolId: req.user.schoolId })
  const exam = await Exam.create({
    schoolId: req.user.schoolId,
    academicYearId: activeYear._id,
    name,
    order: order ?? 0,
    isFinal: !!isFinal,
    examMaxMarkSnapshot: settings?.defaultExamMaxMark ?? 100,
  })
  res.status(201).json(exam)
}

// Tirtirid term/exam — waxaa la tirtiraa dhammaan xogta la xiriirta
// (dhibcaha, room-split) sababtoo ah term-kani ma jiro; ma jiro published
// guard halkan sababtoo ah admin-ku waa in uu awoodo inuu saxo khalad
// (tusaale: term khaldan oo magac qaldan leh) xitaa kadib marka la
// published gareeyay.
async function remove(req, res) {
  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!exam) return res.status(404).json({ error: 'Exam not found' })

  await StudentExamResult.deleteMany({ schoolId: req.user.schoolId, examId: exam._id })
  await RoomAssignment.deleteMany({ schoolId: req.user.schoolId, examId: exam._id })
  await Exam.deleteOne({ _id: exam._id })
  res.status(204).end()
}

module.exports = { list, create, remove }
