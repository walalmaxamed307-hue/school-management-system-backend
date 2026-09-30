const {
  School,
  Student,
  Enrollment,
  Class,
  Section,
  AcademicYear,
  StudentTransfer,
  Counter,
} = require('../models')

// Liiska iskuullada kale (ma aha kan aad joogto) — loo isticmaalo
// dropdown-ka "wareeji" ee StudentForm. "Other" (iskuul aan systemka ku
// jirin) waa xal frontend-side ah, ma aha xog halkan ka socota.
async function directory(req, res) {
  const schools = await School.find({ _id: { $ne: req.user.schoolId }, isActive: { $ne: false } })
    .select('name')
    .sort({ name: 1 })
  res.json(schools)
}

// WAREEJINTA (source admin, POST /students/:id/transfer):
// Ardaygu wuxuu ka baxaa iskuulkan MARKIIBA (lifecycleStatus: 'transferred')
// — dhab ahaan ayuu ka tagayaa dugsigan. Laakiin xogtiisa lagama shubo
// iskuulka kale toos ah: waxaa la abuuraa StudentTransfer{status:'initiated'}
// oo sugaya in ADMIN-KA ISKUULKA KALE ansixiyo (accept) — isla xeerka
// StudentTransfer model-ku horeyba u dhisnaa (initiated -> completed/cancelled)
// laakiin aan la isticmaalin. Kaliya marka la ansixiyo ayaa Student+Enrollment
// cusub la abuuraa iskuulka kale.
async function transfer(req, res) {
  const { toSchoolId } = req.body
  const student = await Student.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!student) return res.status(404).json({ error: 'Student not found' })
  if (student.lifecycleStatus !== 'active') {
    return res.status(400).json({ error: `Only active students can be transferred (this one is ${student.lifecycleStatus})` })
  }

  const activeYear = await AcademicYear.findOne({ schoolId: req.user.schoolId, status: 'active' })
  const enrollment = activeYear
    ? await Enrollment.findOne({
        schoolId: req.user.schoolId,
        academicYearId: activeYear._id,
        studentId: student._id,
      })
    : null

  // "Other" — iskuul aan systemka ku jirin. Meel lagu shubo xogta ma
  // jirto, sidaas darteed kaliya waxaan calaamadinaynaa in la wareejiyay —
  // review kuma jiro sababtoo ah ma jiro admin systemka ku jira oo ansixin
  // kara.
  if (!toSchoolId) {
    student.lifecycleStatus = 'transferred'
    await student.save()
    if (enrollment) {
      enrollment.status = 'transferred'
      await enrollment.save()
    }
    return res.json({ transferred: true, destination: 'other' })
  }

  if (!require('mongoose').isValidObjectId(toSchoolId) || String(toSchoolId) === String(req.user.schoolId)) {
    return res.status(400).json({ error: 'toSchoolId is not a valid destination school' })
  }
  const toSchool = await School.findOne({ _id: toSchoolId, isActive: { $ne: false } })
  if (!toSchool) return res.status(400).json({ error: 'toSchoolId does not reference an existing school' })
  if (!enrollment) return res.status(400).json({ error: 'Student has no current enrollment to transfer' })

  // Hubi horay (ka hor inta aan ardayga laga saarin dugsigan) in dugsiga
  // kale uu diyaar u yahay inuu qofka helo — si aan ardayga looga saarin
  // dugsigan haddii aan dugsiga kale la geli karin.
  const toActiveYear = await AcademicYear.findOne({ schoolId: toSchoolId, status: 'active' })
  if (!toActiveYear) return res.status(400).json({ error: 'Destination school has no active academic year' })
  const fromClass = await Class.findById(enrollment.classId)
  const toClass = await Class.findOne({ schoolId: toSchoolId, level: fromClass.level })
  if (!toClass) {
    return res.status(400).json({ error: `Destination school has no class matching level ${fromClass.level}` })
  }
  if (toClass.hasSections) {
    const firstSection = await Section.findOne({ schoolId: toSchoolId, classId: toClass._id }).sort({ name: 1 })
    if (!firstSection) {
      return res.status(400).json({ error: 'Destination class has sections enabled but none created yet' })
    }
  }

  student.lifecycleStatus = 'transferred'
  await student.save()
  enrollment.status = 'transferred'
  await enrollment.save()

  await StudentTransfer.create({
    fromSchoolId: req.user.schoolId,
    fromStudentId: student._id,
    toSchoolId,
    status: 'initiated',
    initiatedByUserId: req.user.userId,
  })

  res.json({ initiated: true, destination: toSchool.name })
}

// Liiska wareejinta SUGAYA ansixinta iskuulkan (destination admin).
async function pendingIncoming(req, res) {
  const transfers = await StudentTransfer.find({ toSchoolId: req.user.schoolId, status: 'initiated' })
    .populate('fromSchoolId', 'name')
    .populate('fromStudentId')
    .sort({ initiatedAt: -1 })
    .lean()

  res.json(
    transfers.map((t) => ({
      id: t._id,
      fromSchool: t.fromSchoolId?.name ?? 'Unknown',
      studentName: t.fromStudentId?.fullName,
      studentCode: t.fromStudentId?.studentCode,
      dob: t.fromStudentId?.dob,
      parentName: t.fromStudentId?.parentName,
      parentPhone: t.fromStudentId?.parentPhone,
      feeCategory: t.fromStudentId?.feeCategory,
      initiatedAt: t.initiatedAt,
    }))
  )
}

// ANSIXINTA (destination admin): hadda kaliya ayaa Student+Enrollment
// cusub la abuuraa dugsigan — isla xisaabinta fasalka-isku-level-ah ee
// hore lagu isticmaali jiray marka wareejinta la sameeyay isla mar (Step 8
// audit kahor).
async function accept(req, res) {
  const t = await StudentTransfer.findOne({ _id: req.params.id, toSchoolId: req.user.schoolId, status: 'initiated' })
  if (!t) return res.status(404).json({ error: 'Pending transfer not found' })

  const fromStudent = await Student.findById(t.fromStudentId)
  if (!fromStudent) return res.status(404).json({ error: 'Original student record is missing' })

  const toActiveYear = await AcademicYear.findOne({ schoolId: req.user.schoolId, status: 'active' })
  if (!toActiveYear) return res.status(400).json({ error: 'Your school has no active academic year' })

  const fromEnrollment = await Enrollment.findOne({
    schoolId: t.fromSchoolId,
    studentId: fromStudent._id,
    status: 'transferred',
  }).sort({ enrolledAt: -1 })
  const fromClass = fromEnrollment ? await Class.findById(fromEnrollment.classId) : null
  if (!fromClass) return res.status(400).json({ error: "Could not determine the student's class level" })

  const toClass = await Class.findOne({ schoolId: req.user.schoolId, level: fromClass.level })
  if (!toClass) {
    return res.status(400).json({ error: `Your school has no class matching level ${fromClass.level}` })
  }
  let toSectionId
  if (toClass.hasSections) {
    const firstSection = await Section.findOne({ schoolId: req.user.schoolId, classId: toClass._id }).sort({ name: 1 })
    if (!firstSection) {
      return res.status(400).json({ error: 'That class has sections enabled but none created yet' })
    }
    toSectionId = firstSection._id
  }

  const seq = await Counter.getNextSequence('studentCode')
  const newStudentCode = `STU-${String(seq).padStart(6, '0')}`

  const newStudent = await Student.create({
    schoolId: req.user.schoolId,
    studentCode: newStudentCode,
    fullName: fromStudent.fullName,
    dob: fromStudent.dob,
    parentName: fromStudent.parentName,
    parentPhone: fromStudent.parentPhone,
    feeCategory: fromStudent.feeCategory,
    discountAmount: fromStudent.discountAmount,
    transferredFromSchoolId: t.fromSchoolId,
    transferredFromStudentId: fromStudent._id,
  })

  try {
    await Enrollment.create({
      schoolId: req.user.schoolId,
      academicYearId: toActiveYear._id,
      studentId: newStudent._id,
      classId: toClass._id,
      sectionId: toSectionId,
      status: 'active',
    })
  } catch (err) {
    await Student.deleteOne({ _id: newStudent._id })
    throw err
  }

  fromStudent.transferredToSchoolId = req.user.schoolId
  fromStudent.transferredToStudentId = newStudent._id
  await fromStudent.save()

  t.status = 'completed'
  t.toStudentId = newStudent._id
  t.completedByUserId = req.user.userId
  t.completedAt = new Date()
  await t.save()

  res.json({ accepted: true, studentCode: newStudentCode })
}

// DIIDMADA (destination admin): ardaygu WAA IN uu ku noqdaa dugsigii hore
// isaga oo 'active' ah — haddii kale wuxuu ku hadhi lahaa 'transferred' isaga
// oo aan iskuul kastaa ku jirin.
async function reject(req, res) {
  const t = await StudentTransfer.findOne({ _id: req.params.id, toSchoolId: req.user.schoolId, status: 'initiated' })
  if (!t) return res.status(404).json({ error: 'Pending transfer not found' })

  const fromStudent = await Student.findById(t.fromStudentId)
  if (fromStudent && fromStudent.lifecycleStatus === 'transferred') {
    fromStudent.lifecycleStatus = 'active'
    await fromStudent.save()
    const fromEnrollment = await Enrollment.findOne({
      schoolId: t.fromSchoolId,
      studentId: fromStudent._id,
      status: 'transferred',
    }).sort({ enrolledAt: -1 })
    if (fromEnrollment) {
      fromEnrollment.status = 'active'
      await fromEnrollment.save()
    }
  }

  t.status = 'cancelled'
  t.notes = req.body?.reason ? String(req.body.reason).slice(0, 500) : t.notes
  await t.save()

  res.json({ rejected: true })
}

module.exports = { directory, transfer, pendingIncoming, accept, reject }
