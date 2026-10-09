const mongoose = require('mongoose')
const { Student, Teacher, Attendance, Fee, Enrollment, AcademicYear } = require('../models')
const { lastDayKeys, buildAttendanceTrend } = require('../utils/ownerStats')

async function stats(req, res) {
  // aggregate() ma u beddelo string-ka ObjectId si toos ah (find() ayaa sameeya) —
  // haddii aan halkan la beddelin, $match-ku waxba ma helo.
  const schoolObjectId = new mongoose.Types.ObjectId(req.user.schoolId)
  const activeYear = await AcademicYear.findOne({ schoolId: req.user.schoolId, status: 'active' })

  const [totalStudents, totalTeachers] = await Promise.all([
    Student.countDocuments({ schoolId: req.user.schoolId, lifecycleStatus: 'active' }),
    Teacher.countDocuments({ schoolId: req.user.schoolId, isActive: true }),
  ])

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)
  const trendStart = new Date(todayStart)
  trendStart.setDate(trendStart.getDate() - 13)
  const trendDays = lastDayKeys(14, todayStart)

  // Session kasta (before_break/after_break) waa xog gooni ah — la kala
  // saarayaa halkan si dashboard-ku u muujiyo labada si sax ah (ma aha isku
  // dar aan macno lahayn oo laba arday isku mid ah ka dhigaya afar).
  const [todayCounts, trendRows] = await Promise.all([
    Attendance.aggregate([
      { $match: { schoolId: schoolObjectId, date: { $gte: todayStart, $lt: todayEnd } } },
      { $group: { _id: { session: '$session', status: '$status' }, count: { $sum: 1 } } },
    ]),
    Attendance.aggregate([
      { $match: { schoolId: schoolObjectId, date: { $gte: trendStart, $lt: todayEnd } } },
      { $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, session: '$session', status: '$status' }, count: { $sum: 1 } } },
    ]),
  ])
  const attendanceToday = {
    before_break: { present: 0, absent: 0, late: 0, excused: 0 },
    after_break: { present: 0, absent: 0, late: 0, excused: 0 },
  }
  for (const c of todayCounts) {
    if (attendanceToday[c._id.session]) attendanceToday[c._id.session][c._id.status] = c.count
  }

  const thisMonth = new Date().toISOString().slice(0, 7)
  const feeAgg = await Fee.aggregate([
    { $match: { schoolId: schoolObjectId, month: thisMonth } },
    { $group: { _id: null, totalPaid: { $sum: '$amountPaid' } } },
  ])
  const totalCollectedThisMonth = feeAgg[0]?.totalPaid ?? 0

  // Ardayda unpaid/partial ee bishan — arday aan weli Fee doc lahayn wuxuu
  // noqonayaa 'unpaid' (haddii uusan 'free' ahayn), isla xeerka
  // feeController.list ee "preview" safka aan la keydin.
  let feesSummary = { paid: 0, partial: 0, unpaid: 0 }
  if (activeYear) {
    const [enrollments, feeDocs] = await Promise.all([
      Enrollment.find({ schoolId: req.user.schoolId, academicYearId: activeYear._id, status: 'active' })
        .populate('studentId', 'feeCategory')
        .lean(),
      Fee.find({ schoolId: req.user.schoolId, academicYearId: activeYear._id, month: thisMonth })
        .select('enrollmentId status')
        .lean(),
    ])
    const feeStatusByEnrollmentId = Object.fromEntries(feeDocs.map((f) => [String(f.enrollmentId), f.status]))
    for (const e of enrollments) {
      const status = feeStatusByEnrollmentId[String(e._id)] ?? (e.studentId?.feeCategory === 'free' ? 'paid' : 'unpaid')
      feesSummary[status] = (feesSummary[status] ?? 0) + 1
    }
  }

  res.json({
    totalStudents,
    totalTeachers,
    attendanceToday,
    totalCollectedThisMonth,
    feesSummary,
    month: thisMonth,
    academicYear: activeYear?.label ?? null,
    attendanceTrend: buildAttendanceTrend(trendRows.map((row) => ({ date: row._id.d, session: row._id.session, status: row._id.status, count: row.count })), trendDays),
  })
}

module.exports = { stats }
