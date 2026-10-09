const mongoose = require('mongoose')
const {
  Enrollment,
  Attendance,
  Fee,
  Exam,
  StudentExamResult,
  AcademicYear,
  SchoolSettings,
} = require('../models')
const { RISK_CONFIG, attendanceSignal, feeSignal, resultSignal, riskLevel } = require('../utils/riskScoring')

// Xisaabinta waxaa lagu wadaagaa: admin (GET /dashboard/risk-students) iyo
// owner (GET /owner/overview) — hal meel, hal xeer.
// Xogta oo dhan waxaa laga soo qaadaa 4 query-yo oo kooban (ma aha query
// arday kasta), sidaa darteed wuu dhaqso yahay xitaa iskuul weyn.
async function computeRiskStudents(schoolId) {
  const schoolObjectId = new mongoose.Types.ObjectId(schoolId)

  const activeYear = await AcademicYear.findOne({ schoolId, status: 'active' })
  const base = {
    thresholds: {
      attendanceWindowDays: RISK_CONFIG.attendanceWindowDays,
      attendanceMinRatePercent: Math.round(RISK_CONFIG.attendanceMinRate * 100),
      feeMinUnpaidMonths: RISK_CONFIG.feeMinUnpaidMonths,
      resultMinFailedExams: RISK_CONFIG.resultMinFailedExams,
    },
  }
  if (!activeYear) {
    return { ...base, academicYear: null, total: 0, highCount: 0, students: [] }
  }

  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - RISK_CONFIG.attendanceWindowDays)
  const currentMonth = new Date().toISOString().slice(0, 7)

  const [enrollments, attAgg, feeDocs, exams, results, settings] = await Promise.all([
    Enrollment.find({ schoolId, academicYearId: activeYear._id, status: 'active' })
      .populate('studentId', 'fullName studentCode feeCategory discountAmount parentName parentPhone lifecycleStatus')
      .populate('classId', 'name')
      .populate('sectionId', 'name')
      .lean(),
    Attendance.aggregate([
      { $match: { schoolId: schoolObjectId, academicYearId: activeYear._id, date: { $gte: since } } },
      { $group: { _id: { enrollmentId: '$enrollmentId', status: '$status' }, count: { $sum: 1 } } },
    ]),
    Fee.find({ schoolId, academicYearId: activeYear._id })
      .select('enrollmentId month amountDue amountPaid status')
      .lean(),
    Exam.find({ schoolId, academicYearId: activeYear._id }).select('name order').lean(),
    // Natiijooyinka la daabacay KALIYA — kuwa weli la gelinayo (qayb) ma
    // xukumayno, haddii kale macallin weli marks geliyaa ayaa ardayda "dhacsiin" lahaa.
    StudentExamResult.find({ schoolId, academicYearId: activeYear._id, published: true })
      .select('enrollmentId examId marks')
      .lean(),
    SchoolSettings.findOne({ schoolId }).lean(),
  ])

  // --- indexes ---
  const attByEnrollment = new Map()
  for (const row of attAgg) {
    const key = String(row._id.enrollmentId)
    if (!attByEnrollment.has(key)) attByEnrollment.set(key, { present: 0, late: 0, absent: 0 })
    const bucket = attByEnrollment.get(key)
    if (row._id.status in bucket) bucket[row._id.status] = row.count // excused waa la iska dhaafay
  }

  const billingMonths = [...new Set(feeDocs.map((f) => f.month))].filter((m) => m < currentMonth).sort()
  const feesByEnrollment = new Map()
  for (const f of feeDocs) {
    const key = String(f.enrollmentId)
    if (!feesByEnrollment.has(key)) feesByEnrollment.set(key, {})
    feesByEnrollment.get(key)[f.month] = f
  }

  const examById = new Map(exams.map((e) => [String(e._id), e]))
  const resultsByEnrollment = new Map()
  for (const r of results) {
    const values = Object.values(r.marks || {})
    const key = String(r.enrollmentId)
    if (!resultsByEnrollment.has(key)) resultsByEnrollment.set(key, [])
    resultsByEnrollment.get(key).push({
      examId: r.examId,
      hasMarks: values.length > 0,
      total: values.reduce((sum, m) => sum + (m || 0), 0),
    })
  }

  const standardAmount = settings?.defaultStandardFeeAmount ?? 0
  const passMark = activeYear.passMarkSnapshot

  // --- arday kasta ---
  const students = []
  for (const e of enrollments) {
    const student = e.studentId
    if (!student || student.lifecycleStatus !== 'active') continue
    const key = String(e._id)
    const reasons = []

    const att = attendanceSignal(attByEnrollment.get(key) ?? {})
    if (att.flag) {
      reasons.push({
        type: 'attendance',
        text: `Attendance hooseeya: ${Math.round(att.rate * 100)}% (${RISK_CONFIG.attendanceWindowDays} maalmood ee ugu dambeeyay)`,
        rate: Math.round(att.rate * 100),
      })
    }

    const fee = feeSignal({
      student,
      enrolledMonth: e.enrolledAt ? new Date(e.enrolledAt).toISOString().slice(0, 7) : null,
      billingMonths,
      feeDocsByMonth: feesByEnrollment.get(key) ?? {},
      standardAmount,
    })
    if (fee.flag) {
      reasons.push({
        type: 'fees',
        text: `Lacag aan la bixin: ${fee.owingMonths} bilood ($${fee.owedAmount})`,
        owingMonths: fee.owingMonths,
        owedAmount: fee.owedAmount,
      })
    }

    const result = resultSignal({ results: resultsByEnrollment.get(key) ?? [], passMark })
    if (result.flag) {
      const names = result.failedExamIds.map((id) => examById.get(id)?.name).filter(Boolean)
      reasons.push({
        type: 'results',
        text: `Natiijo hooseeya: wuu dhacay ${result.failedExamIds.length} imtixaan${names.length ? ` (${names.join(', ')})` : ''}`,
        failedExams: result.failedExamIds.length,
      })
    }

    const level = riskLevel(reasons.length)
    if (!level) continue
    students.push({
      studentId: student._id,
      enrollmentId: e._id,
      name: student.fullName,
      studentCode: student.studentCode,
      className: e.classId?.name ?? '',
      sectionName: e.sectionId?.name ?? '',
      parentName: student.parentName ?? '',
      parentPhone: student.parentPhone ?? '',
      level,
      reasons,
    })
  }

  // Khatarta ugu sarreysa marka hore, kadib magac ahaan.
  students.sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name))

  return {
    ...base,
    academicYear: activeYear.label,
    total: students.length,
    highCount: students.filter((s) => s.level === 'high').length,
    students,
  }
}

// GET /dashboard/risk-students  (admin kaliya — fees + natiijo xog xasaasi ah)
async function riskStudents(req, res) {
  res.json(await computeRiskStudents(req.user.schoolId))
}

module.exports = { riskStudents, computeRiskStudents }
