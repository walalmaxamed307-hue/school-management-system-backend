const { Enrollment, Fee, Student, AcademicYear, SchoolSettings, Class } = require('../models')

async function getActiveYear(schoolId) {
  return AcademicYear.findOne({ schoolId, status: 'active' })
}

async function requireSectionIfNeeded(schoolId, classId, sectionId) {
  const klass = await Class.findOne({ _id: classId, schoolId })
  if (!klass) return { error: 'Class not found', status: 404 }
  if (klass.hasSections && !sectionId) {
    return { error: 'This class has sections — sectionId is required', status: 400 }
  }
  return null
}

// Waxa uu ardaygan ku bixin lahaa bishan, xisaabinaya feeCategory-giisa +
// standard amount-ka HADDA jira (ma aha mid la xardhay marka horena la
// abuuray) — sida u sheegtay: "lacagta standerdka ah" waa mid la socota
// haddii school-ku bedelo qiimaha guud.
function computeAmountDue(student, standardAmount) {
  if (student.feeCategory === 'free') return 0
  if (student.feeCategory === 'discount') {
    return Math.max(0, standardAmount - (student.discountAmount || 0))
  }
  return standardAmount
}

function computeStatus(feeCategory, amountDue, amountPaid) {
  if (feeCategory === 'free') return 'paid' // wax lagama rabo, sidaas darteed "paid" waa sax
  if (amountPaid <= 0) return 'unpaid'
  if (amountPaid < amountDue) return 'partial'
  return 'paid'
}

async function list(req, res) {
  const { classId, sectionId, month } = req.query
  if (!classId || !month) {
    return res.status(400).json({ error: 'classId and month are required' })
  }
  const sectionCheck = await requireSectionIfNeeded(req.user.schoolId, classId, sectionId)
  if (sectionCheck) return res.status(sectionCheck.status).json({ error: sectionCheck.error })

  const activeYear = await getActiveYear(req.user.schoolId)
  if (!activeYear) return res.json([])

  const settings = await SchoolSettings.findOne({ schoolId: req.user.schoolId })
  const standardAmount = settings?.defaultStandardFeeAmount ?? 0

  const enrollments = await Enrollment.find({
    schoolId: req.user.schoolId,
    academicYearId: activeYear._id,
   status: { $nin: ['transferred', 'withdrawn'] }, // arday la wareejiyay iskuulkan kama qayb-galo mar dambe
    classId,
    sectionId: sectionId || undefined,
  })
    .populate('studentId')
    .lean()

  const existingFees = await Fee.find({
    schoolId: req.user.schoolId,
    enrollmentId: { $in: enrollments.map((e) => e._id) },
    month,
  }).lean()
  const feeByEnrollmentId = Object.fromEntries(existingFees.map((f) => [String(f.enrollmentId), f]))

  res.json(
    enrollments.map((e) => {
      const student = e.studentId
      const saved = feeByEnrollmentId[String(e._id)]
      if (saved) {
        return {
          id: saved._id,
          enrollmentId: e._id,
          studentId: student._id,
          name: student.fullName,
          feeCategory: student.feeCategory,
          amountDue: saved.amountDue,
          amountPaid: saved.amountPaid,
          status: saved.status,
          paidDate: saved.paidDate,
        }
      }
      // Weli lama keydin — waa "preview" kaliya, ma aha xog dhab ah
      // (id: null). Marka admin-ku bixinta geliyo, POST /fees ayaa
      // markaas kaliya u abuuri doona xog dhab ah.
      const amountDue = computeAmountDue(student, standardAmount)
      return {
        id: null,
        enrollmentId: e._id,
        studentId: student._id,
        name: student.fullName,
        feeCategory: student.feeCategory,
        amountDue,
        amountPaid: 0,
        status: computeStatus(student.feeCategory, amountDue, 0),
        paidDate: null,
      }
    })
  )
}

async function upsert(req, res) {
  const { enrollmentId, month, amountPaid } = req.body
  if (!enrollmentId || !month || amountPaid === undefined) {
    return res.status(400).json({ error: 'enrollmentId, month, and amountPaid are required' })
  }
  if (typeof amountPaid !== 'number' || !Number.isFinite(amountPaid) || amountPaid < 0) {
    return res.status(400).json({ error: 'amountPaid must be a number >= 0' })
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month must be in YYYY-MM format' })
  }

  const enrollment = await Enrollment.findOne({ _id: enrollmentId, schoolId: req.user.schoolId })
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' })
if (['transferred', 'withdrawn'].includes(enrollment.status)) {
  return res.status(400).json({ error: 'This student is no longer enrolled in this school' })
}
  const student = await Student.findOne({ _id: enrollment.studentId, schoolId: req.user.schoolId })
  if (!student) return res.status(404).json({ error: 'Student not found' })

  let fee = await Fee.findOne({ schoolId: req.user.schoolId, enrollmentId, month })

  if (!fee) {
    // Markan ugu horreysa ee bishaan ee ardaygan la keydiyo — amountDue
    // waxaa la go'aamiyaa HADDA, ka dibna wuu sii adkaanayaa (sida invoice
    // dhab ah) — xitaa haddii standard amount-ku dambe is-bedelo, bishaas
    // gaar ah kama beddelmayo (marka la eego bisha xigta ayaa amount-ka
    // cusub lagu xisaabin doonaa, sida computeAmountDue kor ku qeexan).
    const settings = await SchoolSettings.findOne({ schoolId: req.user.schoolId })
    const standardAmount = settings?.defaultStandardFeeAmount ?? 0
    const amountDue = computeAmountDue(student, standardAmount)

    fee = new Fee({
      schoolId: req.user.schoolId,
      academicYearId: enrollment.academicYearId,
      enrollmentId,
      classId: enrollment.classId,
      sectionId: enrollment.sectionId,
      month,
      amountDue,
      recordedByUserId: req.user.userId,
    })
  }

  // 'free' ardayda lacag lagama rabo — amountPaid input-ka la iska
  // dhaafaa, si aan admin gaari u qorin lacag aan la sugayn.
  // Haddii admin-ku beddelo ardayga 'free' KA DIB markii Fee dhab ah
  // horeyba loo keydiyay bishaas (amountDue horeyba wuu adkaaday) — waa
  // in amountDue-na la dhigaa 0, si aan status:'paid' loo yeelin isla
  // markaana amountDue uu weli tusayo qiimihii hore ee been ah.
  if (student.feeCategory === 'free') fee.amountDue = 0
  else if (amountPaid > fee.amountDue) {
    return res.status(400).json({ error: `amountPaid cannot exceed the amount due ($${fee.amountDue})` })
  }
  fee.amountPaid = student.feeCategory === 'free' ? 0 : amountPaid
  fee.status = computeStatus(student.feeCategory, fee.amountDue, fee.amountPaid)
  fee.paidDate = fee.status === 'paid' ? new Date() : null
  fee.recordedByUserId = req.user.userId

  await fee.save()
  res.status(201).json(fee)
}

module.exports = { list, upsert }
