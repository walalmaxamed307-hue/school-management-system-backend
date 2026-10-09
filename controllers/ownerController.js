const mongoose = require('mongoose')
const {
  School, Student, Teacher, TeacherAttendance, Enrollment, Class, Section,
  Attendance, Fee, Exam, StudentExamResult, AcademicYear, SchoolSettings,
} = require('../models')
const { computeRiskStudents } = require('./riskStudentsController')
const S = require('../utils/ownerStats')

// GET /owner/overview  (owner kaliya — READ-ONLY)
// Hal jawaab oo ka kooban xaaladda iskuulka maanta: ardayda, joogitaanka,
// macallimiinta, lacagta, natiijooyinka iyo ardayda khatarta ah. Xisaabaadka
// "pure" ah waxay ku jiraan utils/ownerStats.js (test-gareysan).
async function overview(req, res) {
  const schoolId = req.user.schoolId
  // aggregate() ma u beddelo string-ka ObjectId si toos ah (find() ayaa sameeya)
  const oid = new mongoose.Types.ObjectId(schoolId)

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)

  const monthKeys = S.lastMonthKeys(6, now)
  const thisMonth = monthKeys[monthKeys.length - 1]
  const firstMonthStart = new Date(`${monthKeys[0]}-01T00:00:00.000Z`)
  const thisMonthStart = new Date(`${thisMonth}-01T00:00:00.000Z`)
  const trendDays = S.lastDayKeys(14, now)
  const trendStart = new Date(todayStart)
  trendStart.setDate(trendStart.getDate() - 13)

  const [school, activeYear] = await Promise.all([
    School.findById(schoolId).select('name phone address').lean(),
    AcademicYear.findOne({ schoolId, status: 'active' }).lean(),
  ])
  const base = {
    school: { name: school?.name ?? '', phone: school?.phone ?? '', address: school?.address ?? '' },
    generatedAt: now.toISOString(),
    today: S.localDateKey(now),
    academicYear: activeYear?.label ?? null,
  }
  if (!activeYear) return res.json({ ...base, noActiveYear: true })
  const yearId = activeYear._id

  const [
    classes, sections, enrollments, totalStudents, teachersTotal, teacherAttRows,
    recentStudents, trendRows, todayRows, feeDocsThisMonth, feeHistoryRows,
    feeTodayRows, settings, exams, publishedRows, risk,
  ] = await Promise.all([
    Class.find({ schoolId, isActive: true }).select('name level').sort({ level: 1 }).lean(),
    Section.find({ schoolId, isActive: true }).select('classId name').lean(),
    Enrollment.find({ schoolId, academicYearId: yearId, status: 'active' })
      .select('studentId classId sectionId')
      .populate('studentId', 'feeCategory discountAmount')
      .lean(),
    Student.countDocuments({ schoolId, lifecycleStatus: 'active' }),
    Teacher.countDocuments({ schoolId, isActive: true }),
    TeacherAttendance.aggregate([
      { $match: { schoolId: oid, date: { $gte: todayStart, $lt: todayEnd } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Student.find({ schoolId, createdAt: { $gte: firstMonthStart } })
      .select('fullName studentCode createdAt')
      .sort({ createdAt: -1 })
      .lean(),
    Attendance.aggregate([
      { $match: { schoolId: oid, date: { $gte: trendStart, $lt: todayEnd } } },
      {
        $group: {
          _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, session: '$session', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]),
    Attendance.aggregate([
      { $match: { schoolId: oid, date: { $gte: todayStart, $lt: todayEnd } } },
      { $group: { _id: { classId: '$classId', sectionId: '$sectionId', session: '$session', status: '$status' }, count: { $sum: 1 } } },
    ]),
    Fee.find({ schoolId, academicYearId: yearId, month: thisMonth }).select('enrollmentId amountDue amountPaid').lean(),
    Fee.aggregate([
      { $match: { schoolId: oid, month: { $in: monthKeys } } },
      { $group: { _id: '$month', collected: { $sum: '$amountPaid' } } },
    ]),
    // Lacagta maanta la diiwaangeliyay: Fee docs maanta la cusboonaysiiyay.
    // (amountPaid waa wadarta bisha, ma aha lacagta wicitaankan — haddii
    // qofka lacag hore qayb ku bixiyay, waxaa ku jiri kara; sidaa darteed UI-ga
    // waxaa loo magacaabay "diiwaan maanta".)
    Fee.aggregate([
      { $match: { schoolId: oid, updatedAt: { $gte: todayStart, $lt: todayEnd }, amountPaid: { $gt: 0 } } },
      { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amountPaid' } } },
    ]),
    SchoolSettings.findOne({ schoolId }).select('defaultStandardFeeAmount').lean(),
    Exam.find({ schoolId, academicYearId: yearId }).select('name order').lean(),
    StudentExamResult.aggregate([
      { $match: { schoolId: oid, academicYearId: yearId, published: true } },
      { $group: { _id: '$examId', n: { $sum: 1 } } },
    ]),
    computeRiskStudents(schoolId),
  ])

  // ------------------------------------------------------------------ names
  const classById = new Map(classes.map((c) => [String(c._id), c]))
  const sectionById = new Map(sections.map((s) => [String(s._id), s]))
  const className = (id) => classById.get(String(id))?.name ?? ''
  const sectionName = (id) => (id ? sectionById.get(String(id))?.name ?? '' : '')
  const enrollmentByStudent = new Map(enrollments.map((e) => [String(e.studentId?._id ?? e.studentId), e]))

  // --------------------------------------------------- class distribution
  const studentsPerClass = new Map()
  const groupSizes = new Map() // `${classId}|${sectionId}` -> arday
  for (const e of enrollments) {
    const c = String(e.classId)
    studentsPerClass.set(c, (studentsPerClass.get(c) ?? 0) + 1)
    const g = `${c}|${e.sectionId ? String(e.sectionId) : ''}`
    groupSizes.set(g, (groupSizes.get(g) ?? 0) + 1)
  }
  const classDistribution = classes
    .map((c) => ({ classId: String(c._id), className: c.name, students: studentsPerClass.get(String(c._id)) ?? 0 }))
    .filter((c) => c.students > 0)

  // ------------------------------------------------- attendance (maanta)
  const todayBuckets = { before_break: {}, after_break: {} }
  const perClass = new Map() // classId -> { before_break:{}, after_break:{} }
  const markedGroups = { before_break: new Set(), after_break: new Set() }
  for (const r of todayRows) {
    const { classId, sectionId, session, status } = r._id
    if (!todayBuckets[session]) continue
    todayBuckets[session][status] = (todayBuckets[session][status] ?? 0) + r.count
    const cid = String(classId)
    if (!perClass.has(cid)) perClass.set(cid, { before_break: {}, after_break: {} })
    const pc = perClass.get(cid)[session]
    pc[status] = (pc[status] ?? 0) + r.count
    markedGroups[session].add(`${cid}|${sectionId ? String(sectionId) : ''}`)
  }
  const attendanceToday = {
    before: S.sessionSummary(todayBuckets.before_break),
    after: S.sessionSummary(todayBuckets.after_break),
  }
  const attendanceByClass = classDistribution.map((c) => {
    const pc = perClass.get(c.classId) ?? { before_break: {}, after_break: {} }
    return {
      classId: c.classId,
      className: c.className,
      students: c.students,
      before: S.sessionSummary(pc.before_break),
      after: S.sessionSummary(pc.after_break),
    }
  })
  const pendingFor = (session) =>
    [...groupSizes.entries()]
      .filter(([g]) => !markedGroups[session].has(g))
      .map(([g, students]) => {
        const [cid, sid] = g.split('|')
        return { className: className(cid), sectionName: sectionName(sid), students }
      })
  const attendancePending = {
    totalGroups: groupSizes.size,
    before: pendingFor('before_break'),
    after: pendingFor('after_break'),
  }

  const attendanceTrend = S.buildAttendanceTrend(
    trendRows.map((r) => ({ date: r._id.d, session: r._id.session, status: r._id.status, count: r.count })),
    trendDays
  )

  // --------------------------------------------------- macallimiinta maanta
  const tCounts = Object.fromEntries(teacherAttRows.map((r) => [r._id, r.count]))
  const tMarked = Object.values(tCounts).reduce((a, b) => a + b, 0)
  const teachersToday = {
    total: teachersTotal,
    present: tCounts.present ?? 0,
    late: tCounts.late ?? 0,
    absent: tCounts.absent ?? 0,
    excused: tCounts.excused ?? 0,
    notMarked: Math.max(0, teachersTotal - tMarked),
  }

  // -------------------------------------------------------- ardayda cusub
  const todayNew = recentStudents.filter((s) => new Date(s.createdAt) >= todayStart)
  const monthlyNew = new Map(monthKeys.map((m) => [m, 0]))
  for (const s of recentStudents) {
    const k = S.monthKey(new Date(s.createdAt))
    if (monthlyNew.has(k)) monthlyNew.set(k, monthlyNew.get(k) + 1)
  }
  const newStudents = {
    today: todayNew.length,
    thisMonth: recentStudents.filter((s) => new Date(s.createdAt) >= thisMonthStart).length,
    todayList: todayNew.slice(0, 8).map((s) => {
      const e = enrollmentByStudent.get(String(s._id))
      return { name: s.fullName, studentCode: s.studentCode, className: e ? className(e.classId) : '', sectionName: e ? sectionName(e.sectionId) : '' }
    }),
    byMonth: monthKeys.map((m) => ({ month: m, count: monthlyNew.get(m) })),
  }

  // ----------------------------------------------------------------- lacagta
  const standard = settings?.defaultStandardFeeAmount ?? 0
  const docByEnrollment = new Map(feeDocsThisMonth.map((f) => [String(f.enrollmentId), f]))
  const statusCounts = { paid: 0, partial: 0, unpaid: 0 }
  let expected = 0
  for (const e of enrollments) {
    const st = e.studentId
    const doc = docByEnrollment.get(String(e._id))
    if (st?.feeCategory === 'free') {
      statusCounts.paid += 1
      continue
    }
    const implicit = st?.feeCategory === 'discount' ? Math.max(0, standard - (st.discountAmount || 0)) : standard
    const due = doc ? doc.amountDue : implicit
    expected += due
    const paid = doc?.amountPaid ?? 0
    const status = paid <= 0 ? 'unpaid' : paid < due ? 'partial' : 'paid'
    statusCounts[due <= 0 ? 'paid' : status] += 1
  }
  const historyMap = new Map(feeHistoryRows.map((r) => [r._id, r.collected]))
  const collectedThisMonth = historyMap.get(thisMonth) ?? 0
  const fees = {
    month: thisMonth,
    expected,
    collected: collectedThisMonth,
    outstanding: Math.max(0, expected - collectedThisMonth),
    collectionRatePercent: S.pct(collectedThisMonth, expected),
    statusCounts,
    recordedToday: { count: feeTodayRows[0]?.count ?? 0, amount: feeTodayRows[0]?.amount ?? 0 },
    history: monthKeys.map((m) => ({ month: m, collected: historyMap.get(m) ?? 0 })),
  }

  // -------------------------------------------------------------- natiijooyin
  let latestExam = null
  const published = new Map(publishedRows.map((r) => [String(r._id), r.n]))
  const examsWithResults = exams.filter((e) => published.has(String(e._id)))
  if (examsWithResults.length > 0) {
    const exam = examsWithResults.sort((a, b) => b.order - a.order)[0]
    const rows = await StudentExamResult.find({ schoolId, examId: exam._id, published: true })
      .select('enrollmentId marks')
      .lean()
    const classOfEnrollment = new Map(enrollments.map((e) => [String(e._id), e.classId]))
    const stats = S.passStats(
      rows.map((r) => {
        const values = Object.values(r.marks || {})
        return {
          classId: classOfEnrollment.get(String(r.enrollmentId)) ?? 'unknown',
          hasMarks: values.length > 0,
          total: values.reduce((sum, m) => sum + (m || 0), 0),
        }
      }),
      activeYear.passMarkSnapshot
    )
    latestExam = {
      name: exam.name,
      passMark: activeYear.passMarkSnapshot,
      ...stats,
      byClass: stats.byClass
        .filter((c) => c.classId !== 'unknown')
        .map((c) => ({ ...c, className: className(c.classId) }))
        .sort((a, b) => (classById.get(a.classId)?.level ?? 0) - (classById.get(b.classId)?.level ?? 0)),
    }
  }

  // ------------------------------------------------------------------ khatar
  // Xogta waalidka looma dirayo owner-ka — kaliya sababaha.
  const riskSummary = {
    total: risk.total,
    highCount: risk.highCount,
    byType: S.riskBreakdown(risk.students),
    thresholds: risk.thresholds,
    top: risk.students.slice(0, 8).map((s) => ({
      name: s.name, className: s.className, sectionName: s.sectionName, level: s.level, reasons: s.reasons.map((r) => ({ type: r.type, text: r.text })),
    })),
  }

  res.json({
    ...base,
    totals: { students: totalStudents, teachers: teachersTotal, classes: classDistribution.length },
    newStudents,
    attendanceToday,
    attendanceByClass,
    attendancePending,
    attendanceTrend,
    teachersToday,
    classDistribution,
    fees,
    latestExam,
    risk: riskSummary,
  })
}

module.exports = { overview }
