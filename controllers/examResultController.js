const {
  Exam,
  Enrollment,
  StudentExamResult,
  AcademicYear,
  TeacherAssignment,
  TeacherAttendanceScope,
  Class,
  Subject,
} = require('../models')

async function requireSectionIfNeeded(schoolId, classId, sectionId) {
  const klass = await Class.findOne({ _id: classId, schoolId })
  if (!klass) return { error: 'Class not found', status: 404 }
  if (klass.hasSections && !sectionId) {
    return { error: 'This class has sections — sectionId is required', status: 400 }
  }
  return null
}

async function getActiveYear(schoolId) {
  return AcademicYear.findOne({ schoolId, status: 'active' })
}

// Isla "canEditSubject" ee frontend-ku lahaa (user.subjects.includes(subj))
// laakiin mid ka sax badan: waxaan hubinaynaa TeacherAssignment dhab ah oo
// u gaar ah class+section+subject-kan, ma aha liis flat ah oo guud.
// sectionId: null ee TeacherAssignment micnaheedu waa "fasalka oo dhan" —
// sidaas darteed wuxuu ku filan yahay section kasta oo fasalkaas ka tirsan.
async function canEditSubject(req, classId, sectionId, subjectId) {
  if (req.user.role === 'admin') return true
  if (!req.user.teacherId) return false
  const activeYear = await getActiveYear(req.user.schoolId)
  if (!activeYear) return false
  const assignment = await TeacherAssignment.findOne({
    schoolId: req.user.schoolId,
    academicYearId: activeYear._id,
    teacherId: req.user.teacherId,
    classId,
    subjectId,
    $or: [{ sectionId: null }, { sectionId: sectionId ?? null }],
  })
  return !!assignment
}

// Isla "canPublish" ee frontend-ku lahaa: admin, ama fasalka/section-kan
// horjoogihiisa AH oo kaliya (TeacherAttendanceScope isku mid ah).
async function canPublish(req, classId, sectionId) {
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

// Macalinku wuxuu arki karaa KALIYA fasallada uu dhab ahaan la xiriiro —
// horjoogahiisa (homeroom) AMA fasal uu maado ku dhigo — ma aha fasal kasta
// oo school-ka ku jira. (canEditSubject/canPublish way sii adkaadaan
// dhinaca WAX-KA-BEDDELKA, kani waa xad dhinaca ARAGIDDA/AKHRISKA.)
async function canViewResults(req, classId, sectionId) {
  if (req.user.role === 'admin') return true
  if (!req.user.teacherId) return false
  if (await canPublish(req, classId, sectionId)) return true
  const activeYear = await getActiveYear(req.user.schoolId)
  if (!activeYear) return false
  const assignment = await TeacherAssignment.findOne({
    schoolId: req.user.schoolId,
    academicYearId: activeYear._id,
    teacherId: req.user.teacherId,
    classId,
    $or: [{ sectionId: null }, { sectionId: sectionId ?? null }],
  })
  return !!assignment
}

// Isla computeClassRankings ee lib/grading.js (frontend): average-ku waa
// total / tirada maadooyinka DHAB AHAAN la geliyay (ma aha tirada Subject
// guud ee school-ku leeyahay), rank-ku waa total (descending) gudaha
// liiskan la doortay (class+section) KALIYA — ma aha school-ka oo dhan.
function computeRankings(rows) {
  const withTotals = rows.map((r) => {
    const values = Object.values(r.marks)
    const total = values.reduce((sum, m) => sum + (m || 0), 0)
    const average = values.length > 0 ? total / values.length : 0
    return { ...r, total, average }
  })
  const sorted = [...withTotals].sort((a, b) => b.total - a.total)
  return sorted.map((row, i) => ({ ...row, rank: i + 1 }))
}

async function getResults(req, res) {
  const { classId, sectionId } = req.query
  if (!classId) return res.status(400).json({ error: 'classId is required' })
  const sectionCheck = await requireSectionIfNeeded(req.user.schoolId, classId, sectionId)
  if (sectionCheck) return res.status(sectionCheck.status).json({ error: sectionCheck.error })

  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!exam) return res.status(404).json({ error: 'Exam not found' })

  if (!(await canViewResults(req, classId, sectionId))) {
    return res.status(403).json({ error: 'You are not the homeroom teacher or an assigned subject teacher for this class/section' })
  }

  const activeYear = await getActiveYear(req.user.schoolId)
  const isCurrentYear = String(exam.academicYearId) === String(activeYear?._id)

  const enrollments = await Enrollment.find({
    schoolId: req.user.schoolId,
    academicYearId: exam.academicYearId,
    status: { $ne: 'transferred' }, // arday la wareejiyay iskuulkan kama qayb-galo mar dambe
    classId,
    sectionId: sectionId || undefined,
  })
    .populate('studentId', 'fullName studentCode')
    .lean()

  // MUHIIM: `.lean()` lama isticmaalayo halkan si ku talagalay — Mongoose
  // wuxuu `marks` (Map) ugu beddelaa OBJECT caadi ah marka la isticmaalo
  // .lean(), oo Object.fromEntries() kaliya wuxuu qaataa iterable (Map ama
  // array) — mid caadi ah wuu tuurayaa "TypeError: object is not iterable".
  // Tani ayaa sababi jirtay 500 Internal Server Error marka natiijooyinku
  // la soo qaadeen (publish ka dib, marka result la kaydiyay).
  const results = await StudentExamResult.find({
    schoolId: req.user.schoolId,
    examId: exam._id,
    enrollmentId: { $in: enrollments.map((e) => e._id) },
  })
  const resultByEnrollmentId = Object.fromEntries(results.map((r) => [String(r.enrollmentId), r]))

  const rows = enrollments.map((e) => {
    const result = resultByEnrollmentId[String(e._id)]
    return {
      enrollmentId: e._id,
      studentId: e.studentId._id,
      name: e.studentId.fullName,
      marks: result ? Object.fromEntries(result.marks) : {},
      published: result?.published ?? false,
    }
  })
  const ranked = computeRankings(rows)

  res.json({
    exam: { id: exam._id, name: exam.name, isFinal: exam.isFinal, examMaxMark: exam.examMaxMarkSnapshot },
    isCurrentYear,
    allPublished: ranked.length > 0 && ranked.every((r) => r.published),
    canPublish: isCurrentYear && (await canPublish(req, classId, sectionId)),
    rows: ranked,
  })
}

async function putMark(req, res) {
  const { enrollmentId, subjectId, mark } = req.body
  if (!enrollmentId || !subjectId || mark === undefined) {
    return res.status(400).json({ error: 'enrollmentId, subjectId, and mark are required' })
  }

  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!exam) return res.status(404).json({ error: 'Exam not found' })

  const activeYear = await getActiveYear(req.user.schoolId)
  if (String(exam.academicYearId) !== String(activeYear?._id)) {
    return res.status(400).json({ error: 'This exam is from a past academic year — read-only' })
  }

  const enrollment = await Enrollment.findOne({ _id: enrollmentId, schoolId: req.user.schoolId })
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' })

  // Tenant isolation: maadadu waa in ay ka tirsan tahay iskuulkan (admin-ku
  // wuxuu marka kale ka gudbi jiray canEditSubject iyada oo aan la hubin).
  const subject = await Subject.findOne({ _id: subjectId, schoolId: req.user.schoolId })
  if (!subject) return res.status(404).json({ error: 'Subject not found' })

  if (typeof mark !== 'number' || !Number.isFinite(mark) || mark < 0 || mark > exam.examMaxMarkSnapshot) {
    return res.status(400).json({ error: `mark must be between 0 and ${exam.examMaxMarkSnapshot}` })
  }
  if (!(await canEditSubject(req, enrollment.classId, enrollment.sectionId, subjectId))) {
    return res.status(403).json({ error: 'You are not assigned to teach this subject for this class/section' })
  }

  let result = await StudentExamResult.findOne({ schoolId: req.user.schoolId, examId: exam._id, enrollmentId })

  // Isla "unlocked" xeerka frontend-ku lahaa: marka natiijadu horeyba
  // published tahay, kaliya qofka canPublish ah (admin/homeroom) ayaa
  // dib u wax ka beddeli kara — macalinka subject-ka gaarka ah kuma
  // celcelin karo natiijo horeyba la publish gareeyay.
  if (result?.published && !(await canPublish(req, enrollment.classId, enrollment.sectionId))) {
    return res.status(403).json({ error: 'This result is already published — only the homeroom teacher or admin can edit it now' })
  }

  if (!result) {
    result = new StudentExamResult({
      schoolId: req.user.schoolId,
      academicYearId: exam.academicYearId,
      enrollmentId,
      examId: exam._id,
      classId: enrollment.classId,
      sectionId: enrollment.sectionId,
      maxMarkSnapshot: exam.examMaxMarkSnapshot,
    })
  }
  result.marks.set(String(subjectId), mark)
  await result.save()
  res.json({ ...result.toObject(), marks: Object.fromEntries(result.marks) })
}

// Isla "publishClass" ee frontend-ku lahaa: dhammaan ardayda la doortay
// (class+section) waa la wada publish gareeyaa hal mar — mid aan
// StudentExamResult lahayn weli wuxuu helayaa mid madhan (marks: {}) oo
// la publish gareeyay, isla sida frontend-ku u sameeyo.
async function publish(req, res) {
  const { classId, sectionId } = req.body
  if (!classId) return res.status(400).json({ error: 'classId is required' })
  const sectionCheck = await requireSectionIfNeeded(req.user.schoolId, classId, sectionId)
  if (sectionCheck) return res.status(sectionCheck.status).json({ error: sectionCheck.error })

  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!exam) return res.status(404).json({ error: 'Exam not found' })

  const activeYear = await getActiveYear(req.user.schoolId)
  if (String(exam.academicYearId) !== String(activeYear?._id)) {
    return res.status(400).json({ error: 'This exam is from a past academic year — read-only' })
  }
  if (!(await canPublish(req, classId, sectionId))) {
    return res.status(403).json({ error: 'Only this class/section\'s homeroom teacher or admin can publish' })
  }

  const enrollments = await Enrollment.find({
    schoolId: req.user.schoolId,
    academicYearId: exam.academicYearId,
    status: { $ne: 'transferred' }, // arday la wareejiyay iskuulkan kama qayb-galo mar dambe
    classId,
    sectionId: sectionId || undefined,
  })

  for (const enrollment of enrollments) {
    await StudentExamResult.findOneAndUpdate(
      { schoolId: req.user.schoolId, examId: exam._id, enrollmentId: enrollment._id },
      {
        $setOnInsert: {
          schoolId: req.user.schoolId,
          academicYearId: exam.academicYearId,
          enrollmentId: enrollment._id,
          examId: exam._id,
          classId: enrollment.classId,
          sectionId: enrollment.sectionId,
          maxMarkSnapshot: exam.examMaxMarkSnapshot,
        },
        $set: {
          published: true,
          publishedAt: new Date(),
          publishedByUserId: req.user.userId,
        },
      },
      { new: true, upsert: true, runValidators: true }
    )
  }

  res.json({ published: true, count: enrollments.length })
}

module.exports = { getResults, putMark, publish }
