const {
  Homework,
  Class,
  Section,
  Subject,
  TeacherAssignment,
  AcademicYear,
  Enrollment,
} = require('../models')

const POPULATE = [
  { path: 'classId', select: 'name' },
  { path: 'sectionId', select: 'name' },
  { path: 'subjectId', select: 'name' },
  { path: 'teacherId', select: 'fullName' },
]

async function getActiveYear(schoolId) {
  return AcademicYear.findOne({ schoolId, status: 'active' })
}

function serialize(h) {
  return {
    id: h._id,
    question: h.question,
    classId: h.classId?._id ?? null,
    class: h.classId?.name ?? null,
    sectionId: h.sectionId?._id ?? null,
    section: h.sectionId?.name ?? null,
    subjectId: h.subjectId?._id ?? null,
    subject: h.subjectId?.name ?? null,
    teacher: h.teacherId?.fullName ?? null,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
  }
}

// Macalinku wuxuu ku qori karaa KALIYA fasalka + maadada loo xilsaaray
// (TeacherAssignment, sanadka active). Haddii xilsaarkiisu yahay fasalka oo
// dhan (sectionId: null) wuxuu u qori karaa section kasta ama dhammaan; haddii
// uu yahay section gaar ah, waa inuu doortaa section-kaas.
async function teacherMayPost(req, yearId, classId, sectionId, subjectId) {
  const rows = await TeacherAssignment.find({
    schoolId: req.user.schoolId,
    academicYearId: yearId,
    teacherId: req.user.teacherId,
    classId,
    subjectId,
  })
    .select('sectionId')
    .lean()
  if (rows.length === 0) return false
  if (rows.some((r) => !r.sectionId)) return true
  return !!sectionId && rows.some((r) => String(r.sectionId) === String(sectionId))
}

// Hubi body-ga (isla xeerarka create iyo update). Waxay soo celisaa
// { error, status } ama { data }.
async function validateBody(req, activeYear) {
  const { classId, sectionId, subjectId } = req.body
  const question = typeof req.body.question === 'string' ? req.body.question.trim() : ''
  if (!classId || !subjectId || !question) {
    return { status: 400, error: 'classId, subjectId and question are required' }
  }
  if (question.length > 4000) {
    return { status: 400, error: 'Question is too long (max 4000 characters)' }
  }

  const schoolId = req.user.schoolId
  const [klass, subject] = await Promise.all([
    Class.findOne({ _id: classId, schoolId }).select('hasSections'),
    Subject.findOne({ _id: subjectId, schoolId }).select('_id'),
  ])
  if (!klass) return { status: 404, error: 'Class not found' }
  if (!subject) return { status: 404, error: 'Subject not found' }

  if (sectionId) {
    if (!klass.hasSections) return { status: 400, error: 'This class has no sections' }
    const section = await Section.findOne({ _id: sectionId, classId, schoolId }).select('_id')
    if (!section) return { status: 400, error: 'Section does not belong to this class' }
  }

  if (!(await teacherMayPost(req, activeYear._id, classId, sectionId || null, subjectId))) {
    return { status: 403, error: 'You are not assigned to teach this subject in this class/section' }
  }
  return { data: { classId, sectionId: sectionId || null, subjectId, question } }
}

function requireTeacherId(req, res) {
  if (!req.user.teacherId) {
    res.status(403).json({ error: 'Only teachers can manage assignments' })
    return false
  }
  return true
}

// GET /homework — assignments-ka macalinku laftiisu qoray (sanadka active).
async function list(req, res) {
  if (!requireTeacherId(req, res)) return
  const activeYear = await getActiveYear(req.user.schoolId)
  if (!activeYear) return res.json([])

  const rows = await Homework.find({
    schoolId: req.user.schoolId,
    academicYearId: activeYear._id,
    teacherId: req.user.teacherId,
  })
    .sort({ createdAt: -1 })
    .limit(300)
    .populate(POPULATE)
    .lean()
  res.json(rows.map(serialize))
}

// POST /homework
async function create(req, res) {
  if (!requireTeacherId(req, res)) return
  const activeYear = await getActiveYear(req.user.schoolId)
  if (!activeYear) return res.status(400).json({ error: 'No active academic year' })

  const checked = await validateBody(req, activeYear)
  if (checked.error) return res.status(checked.status).json({ error: checked.error })

  const doc = await Homework.create({
    schoolId: req.user.schoolId,
    academicYearId: activeYear._id,
    teacherId: req.user.teacherId,
    ...checked.data,
  })
  const saved = await Homework.findById(doc._id).populate(POPULATE).lean()
  res.status(201).json(serialize(saved))
}

// PUT /homework/:id — kan qoray macalinka ayaa wax ka beddeli kara.
async function update(req, res) {
  if (!requireTeacherId(req, res)) return
  const activeYear = await getActiveYear(req.user.schoolId)
  if (!activeYear) return res.status(400).json({ error: 'No active academic year' })

  const doc = await Homework.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
    teacherId: req.user.teacherId,
  })
  if (!doc) return res.status(404).json({ error: 'Assignment not found' })
  if (String(doc.academicYearId) !== String(activeYear._id)) {
    return res.status(400).json({ error: 'This assignment belongs to a previous academic year' })
  }

  const checked = await validateBody(req, activeYear)
  if (checked.error) return res.status(checked.status).json({ error: checked.error })

  Object.assign(doc, checked.data)
  await doc.save()
  const saved = await Homework.findById(doc._id).populate(POPULATE).lean()
  res.json(serialize(saved))
}

// DELETE /homework/:id
async function remove(req, res) {
  if (!requireTeacherId(req, res)) return
  const doc = await Homework.findOneAndDelete({
    _id: req.params.id,
    schoolId: req.user.schoolId,
    teacherId: req.user.teacherId,
  })
  if (!doc) return res.status(404).json({ error: 'Assignment not found' })
  res.status(204).end()
}

// GET /homework/mine — (student token) assignments-ka fasalka ardaygu ku jiro.
// Fasalka/section-ka waxaa laga qaadaa Enrollment-ka ardayga (studentId ka
// yimid token-ka), MA aha wax uu ardaygu soo dirayo.
async function mine(req, res) {
  const { schoolId, studentId } = req.student
  const activeYear = await getActiveYear(schoolId)
  if (!activeYear) return res.json([])

  const enrollment = await Enrollment.findOne({
    schoolId,
    academicYearId: activeYear._id,
    studentId,
    status: 'active',
  }).lean()
  if (!enrollment) return res.json([])

  const rows = await Homework.find({
    schoolId,
    academicYearId: activeYear._id,
    classId: enrollment.classId,
    $or: [{ sectionId: null }, { sectionId: enrollment.sectionId ?? null }],
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate(POPULATE)
    .lean()
  res.json(rows.map(serialize))
}

module.exports = { list, create, update, remove, mine }
