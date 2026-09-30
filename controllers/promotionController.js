const {
  AcademicYear,
  Class,
  Section,
  Enrollment,
  Exam,
  StudentExamResult,
  Student,
  SchoolSettings,
} = require('../models')

// Isla runPromotion() ee frontend-ka (SettingsPage) — laakiin backend-ku
// wuxuu leeyahay Enrollment sanad-kasta-gaar-ah (frontend-ku ma lahayn —
// wuxuu kaliya bedeli jiray student.class hal mar). Sidaas darteed
// "repeated" (aan gudbin) halkan waxay u baahan tahay Enrollment CUSUB oo
// sanadka cusub ah (isla fasalka la mid ah) — ma noqon karto "waxba ha ka
// beddelin", sababtoo ah sanad kasta wuxuu u baahan yahay diiwaan gooni ah.
async function run(req, res) {
  const { toAcademicYearId } = req.body
  if (!toAcademicYearId) return res.status(400).json({ error: 'toAcademicYearId is required' })

  const fromYear = await AcademicYear.findOne({ schoolId: req.user.schoolId, status: 'active' })
  if (!fromYear) return res.status(400).json({ error: 'No active academic year to promote from' })

  const toYear = await AcademicYear.findOne({
    _id: toAcademicYearId,
    schoolId: req.user.schoolId,
    status: 'upcoming',
  })
  if (!toYear) return res.status(400).json({ error: 'toAcademicYearId must reference an "upcoming" academic year' })

  const classes = await Class.find({ schoolId: req.user.schoolId }).sort({ level: 1 })
  const finalExam = await Exam.findOne({ schoolId: req.user.schoolId, academicYearId: fromYear._id, isFinal: true })

  const enrollments = await Enrollment.find({
    schoolId: req.user.schoolId,
    academicYearId: fromYear._id,
    status: 'active',
  })

  let promoted = 0
  let repeated = 0
  let graduated = 0
  const failed = []

  for (const enrollment of enrollments) {
    try {
      let total = 0
      if (finalExam) {
        const result = await StudentExamResult.findOne({
          schoolId: req.user.schoolId,
          examId: finalExam._id,
          enrollmentId: enrollment._id,
        })
        if (result) total = [...result.marks.values()].reduce((sum, m) => sum + (m || 0), 0)
      }
      const passed = total >= fromYear.passMarkSnapshot

      if (!passed) {
        // Ku celi isla fasalka/section-ka, laakiin sanadka CUSUB. status
        // 'active' waa sax — Enrollment-kan CUSUB wuxuu socda, ma dhammaan;
        // 'repeated' waa xaalad taariikhi ah oo lagu dhigayo Enrollment-kii
        // HORE (laba xariiq hoos) kaas oo dhammaaday sanadkiisu.
        await Enrollment.create({
          schoolId: req.user.schoolId,
          academicYearId: toYear._id,
          studentId: enrollment.studentId,
          classId: enrollment.classId,
          sectionId: enrollment.sectionId,
          status: 'active',
        })
        enrollment.status = 'repeated'
        await enrollment.save()
        repeated += 1
        continue
      }

      const idx = classes.findIndex((c) => String(c._id) === String(enrollment.classId))
      const nextClass = idx >= 0 ? classes[idx + 1] : undefined

      if (nextClass) {
        // Sectionka waxaa la sii wataa kaliya haddii fasalka xiga uu leeyahay
        // isla section magaceeda (isla xeerka frontend-ku qabtay). Haddii
        // fasalka xigaa sections leeyahay laakiin magac isku mid ah lama
        // helin, Enrollment validation-ku wuu diidayaa oo ardaygaas waxaa lagu
        // sheegayaa liiska `failed` (kuwa kale way sii socdaan).
        let nextSectionId
        if (nextClass.hasSections && enrollment.sectionId) {
          const oldSection = await Section.findById(enrollment.sectionId)
          if (oldSection) {
            const matching = await Section.findOne({
              schoolId: req.user.schoolId,
              classId: nextClass._id,
              name: oldSection.name,
            })
            nextSectionId = matching?._id
          }
        }
        await Enrollment.create({
          schoolId: req.user.schoolId,
          academicYearId: toYear._id,
          studentId: enrollment.studentId,
          classId: nextClass._id,
          sectionId: nextSectionId,
          status: 'active',
        })
        enrollment.status = 'promoted'
        await enrollment.save()
        promoted += 1
      } else {
        // Fasalka ugu dambeeya + gudbay = qalin-jabis — Enrollment cusub
        // looma abuuro (wax kale ma jiro oo la gudbiyo).
        await Student.updateOne(
          { _id: enrollment.studentId },
          { lifecycleStatus: 'graduated', graduatedAt: new Date() }
        )
        enrollment.status = 'graduated'
        await enrollment.save()
        graduated += 1
      }
    } catch (err) {
      // Hal arday oo xogtiisu qaldan tahay (tusaale: classId aan hadda
      // jirin) ma joojinayo dhammaan promotion-ka — waxaa lagu daraa
      // liiska failed, kuwa kale way sii socdaan.
      failed.push({ enrollmentId: enrollment._id, studentId: enrollment.studentId, error: err.message })
    }
  }

  fromYear.status = 'closed'
  fromYear.closedAt = new Date()
  await fromYear.save()
  toYear.status = 'active'
  await toYear.save()
  await SchoolSettings.updateOne({ schoolId: req.user.schoolId }, { currentAcademicYearId: toYear._id })

  res.json({ promoted, repeated, graduated, failed, fromYear: fromYear.label, toYear: toYear.label })
}

module.exports = { run }
