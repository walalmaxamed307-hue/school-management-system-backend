const {
  Student,
  Enrollment,
  AcademicYear,
  Class,
  Section,
  Counter,
  Attendance,
  Fee,
  StudentExamResult,
  RoomAssignment,
} = require('../models')

const EDITABLE_STATUSES = ['active', 'withdrawn', 'graduated']

async function list(req, res) {
  const activeYear = await AcademicYear.findOne({ schoolId: req.user.schoolId, status: 'active' })
  if (!activeYear) return res.json([])

  const enrollments = await Enrollment.find({ schoolId: req.user.schoolId, academicYearId: activeYear._id })
    .populate('studentId')
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .lean()

  res.json(
    enrollments
      .filter((e) => e.studentId) // ilaali: arday la tirtiray
      .map((e) => ({
        id: e.studentId._id,
        enrollmentId: e._id,
        name: e.studentId.fullName,
        studentCode: e.studentId.studentCode,
        classId: e.classId?._id ?? null,
        sectionId: e.sectionId?._id ?? null,
        class: e.classId?.name,
        section: e.sectionId?.name ?? null,
        dob: e.studentId.dob,
        parentName: e.studentId.parentName,
        parentPhone: e.studentId.parentPhone,
        status: e.studentId.lifecycleStatus,
        feeCategory: e.studentId.feeCategory,
        discountAmount: e.studentId.discountAmount ?? null,
      }))
  )
}

async function create(req, res) {
  const { fullName, dob, parentName, parentPhone, classId, sectionId, feeCategory, discountAmount } = req.body
  // dob waa loo baahan yahay: ardaygu wuxuu ku galaa portal-ka ID + dob.
  if (!fullName || !String(fullName).trim() || !classId || !dob) {
    return res.status(400).json({ error: 'fullName, classId and dob are required' })
  }
  if (Number.isNaN(new Date(dob).getTime())) {
    return res.status(400).json({ error: 'dob is not a valid date' })
  }

  const activeYear = await AcademicYear.findOne({ schoolId: req.user.schoolId, status: 'active' })
  if (!activeYear) return res.status(400).json({ error: 'No active academic year — cannot enroll a student' })

  // Hubi fasalka/section-ka ka hor intaan Student la abuurin (tenant
  // isolation: classId iskuul kale lama aqbalo).
  const klass = await Class.findOne({ _id: classId, schoolId: req.user.schoolId })
  if (!klass) return res.status(400).json({ error: 'classId does not reference a class in this school' })
  const section = sectionId ? await Section.findOne({ _id: sectionId, schoolId: req.user.schoolId }) : null
  if (sectionId && !section) return res.status(400).json({ error: 'sectionId does not reference a section in this school' })

  // studentCode waa la abuuraa halkan, weligiis lagama qaado body-ga —
  // global unique (models/Counter.js).
  const seq = await Counter.getNextSequence('studentCode')
  const studentCode = `STU-${String(seq).padStart(6, '0')}`

  const student = await Student.create({
    schoolId: req.user.schoolId,
    studentCode,
    fullName,
    dob,
    parentName,
    parentPhone,
    feeCategory,
    discountAmount,
  })

  // Enrollment hook-ku wuxuu hubiyaa in section la doortay marka fasalku leeyahay sections.
  let enrollment
  try {
    enrollment = await Enrollment.create({
      schoolId: req.user.schoolId,
      academicYearId: activeYear._id,
      studentId: student._id,
      classId: klass._id,
      sectionId: section?._id,
    })
  } catch (err) {
    await Student.deleteOne({ _id: student._id })
    throw err
  }

  res.status(201).json({
    id: student._id,
    enrollmentId: enrollment._id,
    name: student.fullName,
    studentCode: student.studentCode,
    class: klass.name,
    section: section?.name ?? null,
    status: student.lifecycleStatus,
    feeCategory: student.feeCategory,
    discountAmount: student.discountAmount ?? null,
  })
}

// PATCH: xogta ardayga + fasalka/section-ka (enrollment-ka sanadka hadda) +
// xaaladda (active/withdrawn/graduated). 'transferred' KALIYA POST /:id/transfer.
async function update(req, res) {
  const { fullName, dob, parentName, parentPhone, lifecycleStatus, feeCategory, discountAmount, classId, sectionId } =
    req.body
  const schoolId = req.user.schoolId

  const student = await Student.findOne({ _id: req.params.id, schoolId })
  if (!student) return res.status(404).json({ error: 'Student not found' })

  if (fullName !== undefined && !String(fullName).trim()) {
    return res.status(400).json({ error: 'fullName must not be empty' })
  }
  if (dob !== undefined && (dob === null || Number.isNaN(new Date(dob).getTime()))) {
    return res.status(400).json({ error: 'dob is not a valid date' })
  }

  const statusChanging = lifecycleStatus !== undefined && lifecycleStatus !== student.lifecycleStatus
  if (statusChanging) {
    if (!EDITABLE_STATUSES.includes(lifecycleStatus)) {
      return res.status(400).json({ error: 'Use POST /students/:id/transfer to transfer a student' })
    }
    if (['graduated', 'transferred'].includes(student.lifecycleStatus)) {
      return res.status(400).json({ error: `A ${student.lifecycleStatus} student's status cannot be changed` })
    }
  }

  const activeYear = await AcademicYear.findOne({ schoolId, status: 'active' })
  const enrollment = activeYear
    ? await Enrollment.findOne({ schoolId, academicYearId: activeYear._id, studentId: student._id })
    : null

  // Fasal/section beddelka (kaliya ardayga active).
  const movingClass =
    classId !== undefined &&
    enrollment &&
    (String(enrollment.classId) !== String(classId) || String(enrollment.sectionId ?? '') !== String(sectionId ?? ''))
  if (classId !== undefined && !enrollment && student.lifecycleStatus === 'active') {
    return res.status(400).json({ error: 'Student has no current enrollment' })
  }
  if (movingClass) {
    if (student.lifecycleStatus !== 'active') {
      return res.status(400).json({ error: 'Only active students can change class' })
    }
    // Enrollment hook-ku wuxuu hubiyaa fasalka/section-ka iskuul + section-required.
    enrollment.classId = classId
    enrollment.sectionId = sectionId || undefined
  }

  if (fullName !== undefined) student.fullName = String(fullName).trim()
  if (dob !== undefined) student.dob = dob
  if (parentName !== undefined) student.parentName = parentName
  if (parentPhone !== undefined) student.parentPhone = parentPhone
  if (feeCategory !== undefined) student.feeCategory = feeCategory
  // discountAmount: haddii fee-ku 'discount' ma aha, waa in la nadiifiyaa (validator-ku ma oggola).
  if (discountAmount !== undefined || feeCategory !== undefined) {
    if (student.feeCategory === 'discount') {
      if (discountAmount !== undefined) student.discountAmount = discountAmount
    } else {
      student.discountAmount = undefined
    }
  }
  if (statusChanging) {
    student.lifecycleStatus = lifecycleStatus
    if (lifecycleStatus === 'graduated') student.graduatedAt = new Date()
    if (enrollment) enrollment.status = lifecycleStatus // active | withdrawn | graduated
  }

  // Dhammaan hubi ka hor intaan mid la keydin (transactions ma jiraan).
  await student.validate()
  if (enrollment && (movingClass || statusChanging)) {
    await enrollment.validate()
    await enrollment.save()
  }
  await student.save()

  res.json({ id: student._id, name: student.fullName, status: student.lifecycleStatus })
}

// Tirtirid dhab ah: KALIYA haddii ardaygu aan lahayn wax taariikh ah
// (xaadirin, fee, natiijo, qol imtixaan) — khalad diiwaangelin. Haddii kale
// 409: isticmaal 'withdrawn'.
async function remove(req, res) {
  const schoolId = req.user.schoolId
  const student = await Student.findOne({ _id: req.params.id, schoolId })
  if (!student) return res.status(404).json({ error: 'Student not found' })

  const enrollments = await Enrollment.find({ schoolId, studentId: student._id }).select('_id')
  const enrollmentIds = enrollments.map((e) => e._id)
  const filter = { schoolId, enrollmentId: { $in: enrollmentIds } }
  const [att, fee, res_, room] = await Promise.all([
    Attendance.exists(filter),
    Fee.exists(filter),
    StudentExamResult.exists(filter),
    RoomAssignment.exists(filter),
  ])
  if (att || fee || res_ || room) {
    return res.status(409).json({
      error: 'This student already has attendance/fee/exam records and cannot be deleted. Set their status to "withdrawn" instead.',
    })
  }
  await Enrollment.deleteMany({ schoolId, studentId: student._id })
  await Student.deleteOne({ _id: student._id, schoolId })
  res.status(204).end()
}

// Graduated students have NO enrollment in the active year (promotion
// deliberately doesn't create one for them), so they never show up in `list`.
async function graduates(req, res) {
  const students = await Student.find({
    schoolId: req.user.schoolId,
    lifecycleStatus: 'graduated',
  })
    .sort({ graduatedAt: -1 })
    .lean()

  const lastEnrollments = await Enrollment.find({
    schoolId: req.user.schoolId,
    studentId: { $in: students.map((s) => s._id) },
    status: 'graduated',
  })
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .sort({ enrolledAt: -1 })
    .lean()
  const lastEnrollmentByStudentId = {}
  for (const e of lastEnrollments) {
    if (!lastEnrollmentByStudentId[String(e.studentId)]) {
      lastEnrollmentByStudentId[String(e.studentId)] = e
    }
  }

  res.json(
    students.map((s) => {
      const e = lastEnrollmentByStudentId[String(s._id)]
      return {
        id: s._id,
        name: s.fullName,
        studentCode: s.studentCode,
        parentName: s.parentName,
        parentPhone: s.parentPhone,
        graduatedAt: s.graduatedAt,
        lastClass: e?.classId?.name ?? null,
        lastSection: e?.sectionId?.name ?? null,
      }
    })
  )
}

module.exports = { list, create, update, remove, graduates }
