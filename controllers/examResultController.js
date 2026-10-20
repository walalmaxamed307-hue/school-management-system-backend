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

function marksObject(marks) {
  return marks ? Object.fromEntries(marks) : {}
}

// Part 2 publish ayaa halkan ka sameeya natiijada subject kasta: Part 1 +
// Part 2. Subjects hal qayb keliya laga geliyeyna qiimahooda jira ayaa la
// hayaa; wax dhibco been ah lama abuuro.
function combinePartMarks(partOne, partTwo) {
  const combined = {}
  for (const subjectId of new Set([...Object.keys(partOne), ...Object.keys(partTwo)])) {
    combined[subjectId] = (partOne[subjectId] || 0) + (partTwo[subjectId] || 0)
  }
  return combined
}

async function getResults(req, res) {
  const { classId, sectionId } = req.query
  if (!classId) return res.status(400).json({ error: 'classId is required' })
  const sectionCheck = await requireSectionIfNeeded(req.user.schoolId, classId, sectionId)
  if (sectionCheck) return res.status(sectionCheck.status).json({ error: sectionCheck.error })

  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!exam) return res.status(404).json({ error: 'Exam not found' })
  const inputPart = exam.hasParts ? (String(req.query.part) === '2' ? 2 : 1) : null
  const inputMaxMark = exam.hasParts
    ? (inputPart === 1 ? exam.partOneMaxMark : exam.partTwoMaxMark)
    : exam.examMaxMarkSnapshot

  if (!(await canViewResults(req, classId, sectionId))) {
    return res.status(403).json({ error: 'You are not the homeroom teacher or an assigned subject teacher for this class/section' })
  }

  const activeYear = await getActiveYear(req.user.schoolId)
  const isCurrentYear = String(exam.academicYearId) === String(activeYear?._id)

  const enrollments = await Enrollment.find({
    schoolId: req.user.schoolId,
    academicYearId: exam.academicYearId,
  status: { $nin: ['transferred', 'withdrawn'] },// arday la wareejiyay iskuulkan kama qayb-galo mar dambe
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
      marks: result
        ? (exam.hasParts ? marksObject(inputPart === 1 ? result.partOneMarks : result.partTwoMarks) : marksObject(result.marks))
        : {},
      published: result?.published ?? false,
      publishedPart: result?.publishedPart ?? (result?.published ? 2 : null),
    }
  })
  const ranked = computeRankings(rows)
  const allPublished = ranked.length > 0 && ranked.every((r) => exam.hasParts ? r.publishedPart === 2 : r.published)

  // Part 2 publish ka dib teacher-ku wuxuu u baahan yahay isla xogta uu
  // ardaygu arko: subject kasta Part 1 + Part 2, total iyo kaalinta ku
  // salaysan wadartaas. Raw Part 2 marks weli `marks` ayay ku jiraan si Edit
  // uu ugu shaqeeyo xadka Part 2 oo keliya.
  let responseRows = ranked
  if (exam.hasParts && allPublished) {
    const combinedRanked = computeRankings(enrollments.map((e) => {
      const result = resultByEnrollmentId[String(e._id)]
      return {
        enrollmentId: e._id,
        marks: marksObject(result?.marks),
      }
    }))
    const combinedByEnrollment = new Map(combinedRanked.map((row) => [String(row.enrollmentId), row]))
    responseRows = ranked.map((row) => {
      const combined = combinedByEnrollment.get(String(row.enrollmentId))
      return {
        ...row,
        combinedMarks: combined?.marks ?? {},
        combinedTotal: combined?.total ?? 0,
        combinedRank: combined?.rank ?? 0,
      }
    })
  }

  res.json({
    exam: {
      id: exam._id,
      name: exam.name,
      isFinal: exam.isFinal,
      examMaxMark: exam.examMaxMarkSnapshot,
      hasParts: exam.hasParts,
      partOneMaxMark: exam.partOneMaxMark ?? null,
      partTwoMaxMark: exam.partTwoMaxMark ?? null,
      inputPart,
      inputMaxMark,
    },
    isCurrentYear,
    // Part 1 waa la publish-gareyn karaa, balse "allPublished" wuxuu
    // micnihiisu yahay final-ka term-ka: Part 2 (iyo isku darka) waa dhammaatay.
    allPublished,
    partOnePublished: exam.hasParts && ranked.length > 0 && ranked.every((r) => r.publishedPart === 1 || r.publishedPart === 2),
    canPublish: isCurrentYear && (await canPublish(req, classId, sectionId)),
    rows: responseRows,
  })
}

async function putMark(req, res) {
  const { enrollmentId, subjectId, mark, part } = req.body
  if (!enrollmentId || !subjectId || mark === undefined) {
    return res.status(400).json({ error: 'enrollmentId, subjectId, and mark are required' })
  }

  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!exam) return res.status(404).json({ error: 'Exam not found' })
  const inputPart = exam.hasParts ? Number(part) : null
  if (exam.hasParts && ![1, 2].includes(inputPart)) {
    return res.status(400).json({ error: 'Part 1 or Part 2 is required for this exam' })
  }
  const inputMaxMark = exam.hasParts
    ? (inputPart === 1 ? exam.partOneMaxMark : exam.partTwoMaxMark)
    : exam.examMaxMarkSnapshot

  const activeYear = await getActiveYear(req.user.schoolId)
  if (String(exam.academicYearId) !== String(activeYear?._id)) {
    return res.status(400).json({ error: 'This exam is from a past academic year — read-only' })
  }

  const enrollment = await Enrollment.findOne({ _id: enrollmentId, schoolId: req.user.schoolId })
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' })
if (['transferred', 'withdrawn'].includes(enrollment.status)) {
  return res.status(400).json({ error: 'This student is no longer enrolled in this school' })
}
  // Tenant isolation: maadadu waa in ay ka tirsan tahay iskuulkan (admin-ku
  // wuxuu marka kale ka gudbi jiray canEditSubject iyada oo aan la hubin).
  const subject = await Subject.findOne({ _id: subjectId, schoolId: req.user.schoolId })
  if (!subject) return res.status(404).json({ error: 'Subject not found' })

  if (typeof mark !== 'number' || !Number.isFinite(mark) || mark < 0 || mark > inputMaxMark) {
    return res.status(400).json({ error: `mark must be between 0 and ${inputMaxMark}` })
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
  if (exam.hasParts) {
    const target = inputPart === 1 ? result.partOneMarks : result.partTwoMarks
    target.set(String(subjectId), mark)
  } else {
    result.marks.set(String(subjectId), mark)
  }
  await result.save()
  res.json({ ...result.toObject(), marks: exam.hasParts ? marksObject(inputPart === 1 ? result.partOneMarks : result.partTwoMarks) : marksObject(result.marks) })
}

// Isla "publishClass" ee frontend-ku lahaa: dhammaan ardayda la doortay
// (class+section) waa la wada publish gareeyaa hal mar — mid aan
// StudentExamResult lahayn weli wuxuu helayaa mid madhan (marks: {}) oo
// la publish gareeyay, isla sida frontend-ku u sameeyo.
async function publish(req, res) {
  const { classId, sectionId, part } = req.body
  if (!classId) return res.status(400).json({ error: 'classId is required' })
  const sectionCheck = await requireSectionIfNeeded(req.user.schoolId, classId, sectionId)
  if (sectionCheck) return res.status(sectionCheck.status).json({ error: sectionCheck.error })

  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!exam) return res.status(404).json({ error: 'Exam not found' })
  const publishingPart = exam.hasParts ? Number(part) : null
  if (exam.hasParts && ![1, 2].includes(publishingPart)) {
    return res.status(400).json({ error: 'Part 1 ama Part 2 dooro ka hor publish' })
  }

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
   status: { $nin: ['transferred', 'withdrawn'] }, // arday la wareejiyay iskuulkan kama qayb-galo mar dambe
    classId,
    sectionId: sectionId || undefined,
  })

  for (const enrollment of enrollments) {
    const existing = exam.hasParts
      ? await StudentExamResult.findOne({ schoolId: req.user.schoolId, examId: exam._id, enrollmentId: enrollment._id })
      : null
    const partOneMarks = marksObject(existing?.partOneMarks)
    const partTwoMarks = marksObject(existing?.partTwoMarks)
    const publishedMarks = exam.hasParts
      ? (publishingPart === 1 ? partOneMarks : combinePartMarks(partOneMarks, partTwoMarks))
      : null
    const publishedMaxMark = exam.hasParts
      ? (publishingPart === 1 ? exam.partOneMaxMark : exam.examMaxMarkSnapshot)
      : null
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
          // Split exam-ka maxMarkSnapshot-ka Part 1/Part 2 ayaa $set-ka
          // hoose ku imanaya. Hal update gudaheed isla field laba operator
          // looma qori karo (MongoDB 500 ayuu ku tuuraa).
          ...(!exam.hasParts ? { maxMarkSnapshot: exam.examMaxMarkSnapshot } : {}),
        },
        $set: {
          ...(exam.hasParts ? { marks: publishedMarks, maxMarkSnapshot: publishedMaxMark, publishedPart: publishingPart } : {}),
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
