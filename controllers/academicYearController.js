const { AcademicYear, SchoolSettings } = require('../models')

async function list(req, res) {
  const years = await AcademicYear.find({ schoolId: req.user.schoolId }).sort({ startYear: 1 })
  res.json(years)
}

// "Activate" (upcoming -> active) is intentionally NOT here. That flip
// belongs to the promotion workflow (Step 6): it happens at the same
// moment enrollments get created under the new year, so it can never be
// done in isolation and leave a year "active" with zero enrollments in it.
async function create(req, res) {
  const { startYear, endYear, label } = req.body
  if (!startYear || !endYear || !label) {
    return res.status(400).json({ error: 'startYear, endYear, and label are required' })
  }

  const settings = await SchoolSettings.findOne({ schoolId: req.user.schoolId })
  if (!settings) return res.status(404).json({ error: 'SchoolSettings not found for this school' })

  // Sanadka ugu horreeya ee school-kan wuxuu si toos ah u noqdaa active
  // (wax kale ma jiraan oo la promote gareyn karo); kuwa xiga waxay
  // bilaabmaan 'upcoming' ilaa promotion la qabto.
  const existingCount = await AcademicYear.countDocuments({ schoolId: req.user.schoolId })
  const status = existingCount === 0 ? 'active' : 'upcoming'

  const year = await AcademicYear.create({
    schoolId: req.user.schoolId,
    startYear,
    endYear,
    label,
    status,
    passMarkSnapshot: settings.defaultPassMark,
    examMaxMarkSnapshot: settings.defaultExamMaxMark,
  })

  if (status === 'active') {
    await SchoolSettings.updateOne({ _id: settings._id }, { currentAcademicYearId: year._id })
  }

  res.status(201).json(year)
}

async function close(req, res) {
  const year = await AcademicYear.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!year) return res.status(404).json({ error: 'AcademicYear not found' })
  if (year.status !== 'active') {
    return res
      .status(400)
      .json({ error: `Cannot close a year with status "${year.status}" — only an active year can be closed` })
  }
  year.status = 'closed'
  year.closedAt = new Date()
  await year.save()
  res.json(year)
}

module.exports = { list, create, close }
