const { Class, Section, Enrollment, TeacherAttendanceScope, TeacherAssignment } = require('../models')

async function list(req, res) {
  const classes = await Class.find({ schoolId: req.user.schoolId }).sort({ level: 1 }).lean()
  const sections = await Section.find({ schoolId: req.user.schoolId }).lean()
  const withSections = classes.map((c) => ({
    ...c,
    sections: sections.filter((s) => String(s.classId) === String(c._id)),
  }))
  res.json(withSections)
}

async function create(req, res) {
  const { name, level } = req.body
  if (!name || level === undefined) {
    return res.status(400).json({ error: 'name and level are required' })
  }
  const klass = await Class.create({ schoolId: req.user.schoolId, name, level })
  res.status(201).json(klass)
}

async function update(req, res) {
  const { name, level, isActive } = req.body
  const updates = {}
  if (name !== undefined) updates.name = name
  if (level !== undefined) updates.level = level
  if (isActive !== undefined) updates.isActive = isActive

  const klass = await Class.findOneAndUpdate(
    { _id: req.params.id, schoolId: req.user.schoolId },
    updates,
    { new: true, runValidators: true }
  )
  if (!klass) return res.status(404).json({ error: 'Class not found' })
  res.json(klass)
}

async function remove(req, res) {
  const filter = { schoolId: req.user.schoolId, classId: req.params.id }
  const [enrolled, homeroom, teaching] = await Promise.all([
    Enrollment.exists(filter),
    TeacherAttendanceScope.exists(filter),
    TeacherAssignment.exists(filter),
  ])
  if (enrolled) {
    return res.status(409).json({ error: 'Cannot delete a class that has enrollments — this would orphan student history' })
  }
  if (homeroom || teaching) {
    return res.status(409).json({ error: 'Cannot delete a class that a teacher is assigned to — reassign or remove those first' })
  }
  const klass = await Class.findOneAndDelete({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!klass) return res.status(404).json({ error: 'Class not found' })
  await Section.deleteMany({ schoolId: req.user.schoolId, classId: req.params.id })
  res.status(204).end()
}

async function enableSections(req, res) {
  const klass = await Class.findOneAndUpdate(
    { _id: req.params.id, schoolId: req.user.schoolId },
    { hasSections: true },
    { new: true }
  )
  if (!klass) return res.status(404).json({ error: 'Class not found' })
  res.json(klass)
}

async function addSection(req, res) {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })

  const klass = await Class.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!klass) return res.status(404).json({ error: 'Class not found' })
  if (!klass.hasSections) {
    return res.status(400).json({ error: 'This class has not adopted sections yet — enable sections first' })
  }

  const section = await Section.create({ schoolId: req.user.schoolId, classId: klass._id, name })
  res.status(201).json(section)
}

async function removeSection(req, res) {
  const { sectionId } = req.params
  const [enrolled, homeroom] = await Promise.all([
    Enrollment.exists({ schoolId: req.user.schoolId, sectionId }),
    TeacherAttendanceScope.exists({ schoolId: req.user.schoolId, sectionId }),
  ])
  if (enrolled || homeroom) {
    return res.status(409).json({
      error: 'Cannot delete a section that has enrollments or a homeroom teacher assigned to it',
    })
  }
  const section = await Section.findOneAndDelete({
    _id: sectionId,
    schoolId: req.user.schoolId,
    classId: req.params.id,
  })
  if (!section) return res.status(404).json({ error: 'Section not found' })

  // Marka section-kii ugu dambeeyay la tiro, fasalku wuxuu ku laabanayaa
  // fasal CAADI ah (hasSections=false) — haddii kale wuxuu sii haysan lahaa
  // "dooro section" iyadoo aan section jirin, oo arday cusub lama abuuri karo.
  // (Fasal hore u jiray oo sidaas ku hadhay: ku dar hal section, kadibna tiri —
  // wuxuu noqonayaa caadi.)
  const remaining = await Section.countDocuments({ schoolId: req.user.schoolId, classId: req.params.id })
  if (remaining === 0) {
    await Class.updateOne({ _id: req.params.id, schoolId: req.user.schoolId }, { hasSections: false })
  }
  res.status(204).end()
}

// Ardayda hore ee fasalkan ku jirtay ee weli section lama qoondeynin —
// waa doc kasta oo la keydiyo gaar ahaan (.save(), ma aha updateMany),
// sababtoo ah updateMany() kama fulinayo pre('validate') hooks-ka
// (Mongoose middleware) xitaa runValidators la siiyo — halkii xaqiiji
// karin class/section isku waafajinta, si aamusan ayay uga dhaafi
// lahayd hubinta.
async function bulkAssignSection(req, res) {
  const { sectionId, enrollmentIds } = req.body
  if (!sectionId || !Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
    return res.status(400).json({ error: 'sectionId and a non-empty enrollmentIds array are required' })
  }

  const results = []
  for (const enrollmentId of enrollmentIds) {
    const enrollment = await Enrollment.findOne({
      _id: enrollmentId,
      schoolId: req.user.schoolId,
      classId: req.params.id,
    })
    if (!enrollment) {
      results.push({ enrollmentId, ok: false, error: 'Not found in this class' })
      continue
    }
    enrollment.sectionId = sectionId
    try {
      await enrollment.save()
      results.push({ enrollmentId, ok: true })
    } catch (err) {
      results.push({ enrollmentId, ok: false, error: err.message })
    }
  }
  res.json({ results })
}

module.exports = { list, create, update, remove, enableSections, addSection, removeSection, bulkAssignSection }
