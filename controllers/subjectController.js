const { Subject, TeacherAssignment, StudentExamResult } = require('../models')

async function list(req, res) {
  const subjects = await Subject.find({ schoolId: req.user.schoolId }).sort({ name: 1 })
  res.json(subjects)
}

async function create(req, res) {
  const { name, code } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  const subject = await Subject.create({ schoolId: req.user.schoolId, name, code })
  res.status(201).json(subject)
}

async function update(req, res) {
  const { name, code, isActive } = req.body
  const updates = {}
  if (name !== undefined) updates.name = name
  if (code !== undefined) updates.code = code
  if (isActive !== undefined) updates.isActive = isActive

  const subject = await Subject.findOneAndUpdate(
    { _id: req.params.id, schoolId: req.user.schoolId },
    updates,
    { new: true, runValidators: true }
  )
  if (!subject) return res.status(404).json({ error: 'Subject not found' })
  res.json(subject)
}

// Ma tirtirno haddii maadadan lagu isticmaalo TeacherAssignment mid jira —
// tirtirid caddi ah way ka tagi lahayd assignment orphan ah oo subjectId
// tilmaamaya doc aan jirin. StudentExamResult.marks (Map) sidoo kale wuxuu
// isticmaali karaa subjectId — taas ma hubinno halkan (Map keys guud ahaan
// lama query gareyn karo si fudud), waa gap la og yahay, ma aha mid la
// xalliyay.
async function remove(req, res) {
  const inUse = await TeacherAssignment.exists({ schoolId: req.user.schoolId, subjectId: req.params.id })
  if (inUse) {
    return res.status(409).json({ error: 'Cannot delete a subject that has teacher assignments — reassign or remove those first' })
  }
  // Marks waxay ku kaydsan yihiin Map { subjectId -> mark }; haddii maadada
  // marks laga qoray, tirtirkeeda waxay ka tagi lahayd key "orphan" ah.
  const hasMarks = await StudentExamResult.exists({
    schoolId: req.user.schoolId,
    [`marks.${req.params.id}`]: { $exists: true },
  })
  if (hasMarks) {
    return res.status(409).json({ error: 'Cannot delete a subject that already has recorded exam marks' })
  }
  const subject = await Subject.findOneAndDelete({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!subject) return res.status(404).json({ error: 'Subject not found' })
  res.status(204).end()
}

module.exports = { list, create, update, remove }
