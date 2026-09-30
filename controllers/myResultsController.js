const { AcademicYear, Enrollment, Exam, StudentExamResult, Subject, RoomAssignment } = require('../models')

// Isla computeRankings ee examResultController.js, laakiin halkan waxaan u
// baahanahay kaliya total-ka + rank-ka (ma aha safafka oo dhan — ardaygu
// midkiisa keliya ayuu arki karaa, ma aha dhibcaha ardayda kale).
function rankAmong(results, myEnrollmentId) {
  const totals = results
    .map((r) => ({
      enrollmentId: String(r.enrollmentId),
      total: [...r.marks.values()].reduce((sum, m) => sum + (m || 0), 0),
    }))
    .sort((a, b) => b.total - a.total)
  const rank = totals.findIndex((t) => t.enrollmentId === String(myEnrollmentId)) + 1
  const mine = totals.find((t) => t.enrollmentId === String(myEnrollmentId))
  return { rank, total: mine?.total ?? 0, classSize: totals.length }
}

// Ardaygu wuxuu arki karaa KALIYA exam-yada la publish gareeyay, kuwiisa
// gaarka ah — sanadka HADDA socda kaliya (isla xeerka portal-ka hore).
async function myResults(req, res) {
  const schoolId = req.student.schoolId
  const studentId = req.student.studentId

  const activeYear = await AcademicYear.findOne({ schoolId, status: 'active' })
  if (!activeYear) return res.json([])

  const enrollment = await Enrollment.findOne({
    schoolId,
    academicYearId: activeYear._id,
    studentId,
    status: 'active',
  })
  if (!enrollment) return res.json([])

  const exams = await Exam.find({ schoolId, academicYearId: activeYear._id }).sort({ order: 1 })

  const out = []
  for (const exam of exams) {
    const myResult = await StudentExamResult.findOne({
      schoolId,
      examId: exam._id,
      enrollmentId: enrollment._id,
    })
    if (!myResult || !myResult.published) {
      out.push({ examId: exam._id, examName: exam.name, isFinal: exam.isFinal, published: false })
      continue
    }

    const classResults = await StudentExamResult.find({
      schoolId,
      examId: exam._id,
      classId: enrollment.classId,
      sectionId: enrollment.sectionId,
    })
    const { rank, total, classSize } = rankAmong(classResults, enrollment._id)

    const marksObj = Object.fromEntries(myResult.marks)
    const subjectDocs = await Subject.find({ _id: { $in: Object.keys(marksObj) } }).select('name').lean()
    const subjectNameById = Object.fromEntries(subjectDocs.map((s) => [String(s._id), s.name]))
    const marksBySubjectName = Object.fromEntries(
      Object.entries(marksObj).map(([id, mark]) => [subjectNameById[id] ?? 'Maado la tirtiray', mark])
    )
    const subjectCount = Object.keys(marksObj).length

    out.push({
      examId: exam._id,
      examName: exam.name,
      isFinal: exam.isFinal,
      published: true,
      marks: marksBySubjectName,
      maxMark: myResult.maxMarkSnapshot,
      total,
      average: subjectCount > 0 ? total / subjectCount : 0,
      rank,
      classSize,
      passMark: activeYear.passMarkSnapshot,
    })
  }
  res.json(out)
}

// Qolka imtixaanka ee ugu dambeeya ee ardaygu leeyahay (order-ka exam-ka ugu
// sarreeya) — room-split-ku wuu ka horreeyaa natiijooyinka published-ka, sidaas
// darteed halkan lama sugayo published (isla xeerka backend-ku split-ka).
async function myRoom(req, res) {
  const schoolId = req.student.schoolId
  const studentId = req.student.studentId

  const activeYear = await AcademicYear.findOne({ schoolId, status: 'active' })
  if (!activeYear) return res.json(null)

  const enrollment = await Enrollment.findOne({
    schoolId,
    academicYearId: activeYear._id,
    studentId,
    status: 'active',
  }).populate('classId', 'name')
  if (!enrollment) return res.json(null)

  const assignments = await RoomAssignment.find({
    schoolId,
    academicYearId: activeYear._id,
    enrollmentId: enrollment._id,
  })
    .populate('roomId', 'name')
    .populate('examId', 'name order')
    .lean()
  if (assignments.length === 0) return res.json(null)

  assignments.sort((a, b) => (b.examId?.order ?? 0) - (a.examId?.order ?? 0))
  const latest = assignments[0]
  res.json({
    examName: latest.examId?.name ?? null,
    roomName: latest.roomId?.name ?? null,
    examStatus: latest.examStatus,
    className: enrollment.classId?.name ?? null,
  })
}

module.exports = { myResults, myRoom }
