const {
  Enrollment,
  Attendance,
  AcademicYear,
  TeacherAttendanceScope,
  Student,
  Class,
} = require('../models')

async function getActiveYear(schoolId) {
  return AcademicYear.findOne({ schoolId, status: 'active' })
}

// Fasal sections leh oo sectionId aan la sheegin — haddii aan tan la
// hubin, Enrollment.find-ku wuxuu si aamusan isugu daraya DHAMMAAN
// sections-ka (sectionId: undefined = "no filter" Mongoose-ka). Isla
// xeerka la dabaqay Enrollment/TeacherAttendanceScope marka la abuurayo.
async function requireSectionIfNeeded(schoolId, classId, sectionId) {
  const klass = await Class.findOne({ _id: classId, schoolId })
  if (!klass) return { error: 'Class not found', status: 404 }
  if (klass.hasSections && !sectionId) {
    return { error: 'This class has sections — sectionId is required', status: 400 }
  }
  return null
}

// A teacher can only mark/view attendance for the exact class+section their
// TeacherAttendanceScope covers (or, for scopeType 'all_classes', anything
// in the school). Admin bypasses this entirely. Returns true/false — the
// route decides what status code that becomes.
async function teacherCanAccess(req, classId, sectionId) {
  if (req.user.role === 'admin') return true
  if (!req.user.teacherId) return false
  const activeYear = await getActiveYear(req.user.schoolId)
  if (!activeYear) return false
  const scope = await TeacherAttendanceScope.findOne({
    schoolId: req.user.schoolId,
    academicYearId: activeYear._id,
    teacherId: req.user.teacherId,
  })
  if (!scope) return false
  if (scope.scopeType === 'all_classes') return true
  return (
    String(scope.classId) === String(classId) &&
    String(scope.sectionId ?? '') === String(sectionId ?? '')
  )
}

async function list(req, res) {
  const { classId, sectionId, date, session } = req.query
  if (!classId || !date || !session) {
    return res.status(400).json({ error: 'classId, date, and session are required' })
  }
  const sectionCheck = await requireSectionIfNeeded(req.user.schoolId, classId, sectionId)
  if (sectionCheck) return res.status(sectionCheck.status).json({ error: sectionCheck.error })
  if (!(await teacherCanAccess(req, classId, sectionId))) {
    return res.status(403).json({ error: 'Not your homeroom class/section' })
  }

  const activeYear = await getActiveYear(req.user.schoolId)
  if (!activeYear) return res.json([])

  const enrollments = await Enrollment.find({
    schoolId: req.user.schoolId,
    academicYearId: activeYear._id,
    status: { $nin: ['transferred', 'withdrawn'] }, // arday la wareejiyay iskuulkan kama qayb-galo mar dambe
    classId,
    sectionId: sectionId || undefined,
  })
    .populate('studentId', 'fullName studentCode parentPhone')
    .lean()

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const prevDayStart = new Date(dayStart)
  prevDayStart.setDate(prevDayStart.getDate() - 1)

  const [records, prevRecords] = await Promise.all([
    Attendance.find({
      schoolId: req.user.schoolId,
      enrollmentId: { $in: enrollments.map((e) => e._id) },
      date: { $gte: dayStart, $lt: dayEnd },
      session,
    }).lean(),
    // Xaaladdii maalintii ka horreysay (isla session-ka) — loo isticmaalo
    // kaliya "kuwii shalay maqnaa horta u geeya" (sort-ka frontend-ka).
    Attendance.find({
      schoolId: req.user.schoolId,
      enrollmentId: { $in: enrollments.map((e) => e._id) },
      date: { $gte: prevDayStart, $lt: dayStart },
      session,
    }).lean(),
  ])
  const recordByEnrollmentId = Object.fromEntries(records.map((r) => [String(r.enrollmentId), r]))
  const prevByEnrollmentId = Object.fromEntries(prevRecords.map((r) => [String(r.enrollmentId), r]))

  res.json(
    enrollments.map((e) => ({
      enrollmentId: e._id,
      studentId: e.studentId._id,
      name: e.studentId.fullName,
      studentCode: e.studentId.studentCode,
      parentPhone: e.studentId.parentPhone ?? '',
      status: recordByEnrollmentId[String(e._id)]?.status ?? null,
      previousDayStatus: prevByEnrollmentId[String(e._id)]?.status ?? null,
    }))
  )
}

async function mark(req, res) {
  const { enrollmentId, date, session, status } = req.body
  if (!enrollmentId || !date || !session || !status) {
    return res.status(400).json({ error: 'enrollmentId, date, session, and status are required' })
  }

  const enrollment = await Enrollment.findOne({ _id: enrollmentId, schoolId: req.user.schoolId })
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' })
if (['transferred', 'withdrawn'].includes(enrollment.status)) {
  return res.status(400).json({ error: 'This student is no longer enrolled in this school' })
}
  if (!(await teacherCanAccess(req, enrollment.classId, enrollment.sectionId))) {
    return res.status(403).json({ error: 'Not your homeroom class/section' })
  }

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)

  // Upsert — marking the same student/date/session twice updates the
  // existing record rather than colliding on the unique index.
  const record = await Attendance.findOneAndUpdate(
    { schoolId: req.user.schoolId, enrollmentId, date: dayStart, session },
    {
      schoolId: req.user.schoolId,
      academicYearId: enrollment.academicYearId,
      enrollmentId,
      classId: enrollment.classId,
      sectionId: enrollment.sectionId,
      date: dayStart,
      session,
      status,
      markedByUserId: req.user.userId,
      markedAt: new Date(),
    },
    { new: true, upsert: true, runValidators: true }
  )
  res.status(201).json(record)
}
// POST /attendance/bulk-present — ardayda fasalka/section-ka/maalinta/session-kan
// ee AAN weli la calaamadin oo dhan "present" ka dhig. Kuwa hore loo calaamadiyay
// (absent/late/excused/present) waa la dayaa — MA overwrite-gareyso.
async function markAllPresent(req, res) {
  const { classId, sectionId, date, session } = req.body
  if (!classId || !date || !session) {
    return res.status(400).json({ error: 'classId, date, and session are required' })
  }
  if (!['before_break', 'after_break'].includes(session)) {
    return res.status(400).json({ error: 'Invalid session' })
  }
  const sectionCheck = await requireSectionIfNeeded(req.user.schoolId, classId, sectionId)
  if (sectionCheck) return res.status(sectionCheck.status).json({ error: sectionCheck.error })
  if (!(await teacherCanAccess(req, classId, sectionId))) {
    return res.status(403).json({ error: 'Not your homeroom class/section' })
  }

  const activeYear = await getActiveYear(req.user.schoolId)
  if (!activeYear) return res.status(400).json({ error: 'No active academic year' })

  const dayStart = new Date(date)
  if (Number.isNaN(dayStart.getTime())) return res.status(400).json({ error: 'Invalid date' })
  dayStart.setHours(0, 0, 0, 0)

  // Isla shaandhada GET /attendance (list) — ardayda la arko oo kaliya.
  const enrollments = await Enrollment.find({
    schoolId: req.user.schoolId,
    academicYearId: activeYear._id,
    status: { $nin: ['transferred', 'withdrawn'] },
    classId,
    sectionId: sectionId || undefined,
  })
    .select('_id academicYearId classId sectionId')
    .lean()

  if (enrollments.length === 0) return res.json({ total: 0, marked: 0, alreadyMarked: 0 })

  const now = new Date()
  const result = await Attendance.bulkWrite(
    enrollments.map((e) => ({
      updateOne: {
        filter: { schoolId: req.user.schoolId, enrollmentId: e._id, date: dayStart, session },
        update: {
          $setOnInsert: {
            schoolId: req.user.schoolId,
            academicYearId: e.academicYearId,
            enrollmentId: e._id,
            classId: e.classId,
            sectionId: e.sectionId,
            date: dayStart,
            session,
            status: 'present',
            markedByUserId: req.user.userId,
            markedAt: now,
            createdAt: now,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  )

  const marked = result.upsertedCount ?? 0
  res.status(201).json({
    total: enrollments.length,
    marked,
    alreadyMarked: enrollments.length - marked,
  })
}
// GET /students/:id/absences?year=2025-2026 (defaults to the active year) —
// used on the student's info page: "how many days absent/late this year".
async function studentAbsenceCount(req, res) {
  const student = await Student.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!student) return res.status(404).json({ error: 'Student not found' })

  const activeYear = await getActiveYear(req.user.schoolId)
  if (!activeYear) return res.json({ absentDays: 0, lateDays: 0 })

  const enrollment = await Enrollment.findOne({
    schoolId: req.user.schoolId,
    academicYearId: activeYear._id,
    studentId: student._id,
  })
  if (!enrollment) return res.json({ absentDays: 0, lateDays: 0 })

  // Hal maalin oo laba session leh (before/after break) waxay noqon
  // kartaa laba xog — waxaan tirinaynaa MAALMO gaar ah (distinct dates),
  // ma aha xogo (records), si "5 maalmood" uusan u noqonin "10" beenta ah.
  const [absentDates, lateDates] = await Promise.all([
    Attendance.distinct('date', { schoolId: req.user.schoolId, enrollmentId: enrollment._id, status: 'absent' }),
    Attendance.distinct('date', { schoolId: req.user.schoolId, enrollmentId: enrollment._id, status: 'late' }),
  ])
  res.json({ absentDays: absentDates.length, lateDays: lateDates.length, academicYear: activeYear.label })
}

module.exports = { list, mark, markAllPresent, studentAbsenceCount }
