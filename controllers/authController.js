const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const {
  School,
  User,
  Teacher,
  TeacherAttendanceScope,
  TeacherAssignment,
  AcademicYear,
  Student,
  Enrollment,
} = require('../models')

// Login waa email-ka oo kaliya (school selector ma jiro). Taas waa sax
// sababtoo ah User.email hadda waa GLOBALLY unique (models/User.js) — hal
// email = hal account = hal iskuul.

function signStaffToken(user, teacherId) {
  const payload = { userId: user._id, schoolId: user.schoolId, role: user.role }
  if (teacherId) payload.teacherId = teacherId
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' })
}

// Profile-ka frontend-ku u isticmaalo session-ka (login iyo /auth/me labadaba).
async function buildStaffProfile(user) {
  const profile = { id: user._id, email: user.email, role: user.role, schoolId: user.schoolId }
  let teacherId = null

  if (user.role === 'admin') {
    profile.name = user.name
  }

  if (user.role === 'teacher') {
    const teacher = await Teacher.findOne({ userId: user._id })
    if (teacher) {
      teacherId = teacher._id
      profile.name = teacher.fullName
      profile.teacherId = teacher._id

      // Homeroom scope-ku waa sanad-gaar (year-scoped) — kaliya sanadka
      // ACTIVE ah ayaa la eegaa.
      const activeYear = await AcademicYear.findOne({ schoolId: user.schoolId, status: 'active' })
      const scope = activeYear
        ? await TeacherAttendanceScope.findOne({ teacherId: teacher._id, academicYearId: activeYear._id })
            .populate('classId', 'name')
            .populate('sectionId', 'name')
        : null
      if (scope && scope.scopeType === 'single_class') {
        profile.class = scope.classId?.name ?? null
        profile.section = scope.sectionId?.name ?? null
      }

      // Maadooyinka uu dhigo (fasal+section+maado) — frontend-ku wuxuu u
      // isticmaalaa inuu muujiyo/ogolaado gelinta dhibcaha (Step 8).
      const assignments = activeYear
        ? await TeacherAssignment.find({ teacherId: teacher._id, academicYearId: activeYear._id })
            .populate('classId', 'name')
            .populate('sectionId', 'name')
            .populate('subjectId', 'name')
            .lean()
        : []
      profile.assignments = assignments.map((a) => ({
        classId: a.classId?._id ?? null,
        sectionId: a.sectionId?._id ?? null,
        subjectId: a.subjectId?._id ?? null,
        class: a.classId?.name,
        section: a.sectionId?.name ?? null,
        subject: a.subjectId?.name,
      }))
      profile.subjects = [...new Set(profile.assignments.map((a) => a.subject).filter(Boolean))]
    }
  }
  return { profile, teacherId }
}

async function buildStudentProfile(student) {
  const activeYear = await AcademicYear.findOne({ schoolId: student.schoolId, status: 'active' })
  const enrollment = activeYear
    ? await Enrollment.findOne({
        schoolId: student.schoolId,
        academicYearId: activeYear._id,
        studentId: student._id,
      })
        .populate('classId', 'name')
        .populate('sectionId', 'name')
    : null
  return {
    id: student._id,
    name: student.fullName,
    role: 'student',
    schoolId: student.schoolId,
    studentCode: student.studentCode,
    enrollmentId: enrollment?._id ?? null,
    class: enrollment?.classId?.name ?? null,
    section: enrollment?.sectionId?.name ?? null,
  }
}

async function schoolIsActive(schoolId) {
  const school = await School.findById(schoolId).select('isActive')
  return !!school && school.isActive !== false
}

async function login(req, res) {
  const { email, password } = req.body
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  const user = await User.findOne({ email: email.toLowerCase().trim(), isActive: true })
  if (!user) return res.status(401).json({ error: 'Invalid email or password' })

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' })

  if (!(await schoolIsActive(user.schoolId))) {
    return res.status(403).json({ error: 'This school account is disabled' })
  }

  const { profile, teacherId } = await buildStaffProfile(user)
  res.json({ token: signStaffToken(user, teacherId), user: profile })
}

// Ardaygu ma laha password. Wuxuu isticmaalaa studentCode + taariikhda
// dhalashada (dob). studentCode wuu is-raacaa (STU-000123) marka ID-ga
// kaligiis ma aha xaddaysan (guessable) — DOB ayaa noqonaya qaybta labaad.
// Jawaab qaldan waa isku mid (ma sheegayo midka khaldan) si aan loo
// qiyaasin karin.
async function studentLogin(req, res) {
  const { studentCode, dob } = req.body
  if (typeof studentCode !== 'string' || typeof dob !== 'string' || !studentCode || !dob) {
    return res.status(400).json({ error: 'studentCode and dob are required' })
  }
  const fail = () => res.status(401).json({ error: 'Student ID ama taariikhda dhalashada waa qaldan' })

  const student = await Student.findOne({
    studentCode: studentCode.trim().toUpperCase(),
    lifecycleStatus: 'active',
  })
  if (!student || !student.dob) return fail()

  // dob waxaa lagu kaydiyaa Date (UTC) — isbarbardhig YYYY-MM-DD ah.
  if (student.dob.toISOString().slice(0, 10) !== dob.trim().slice(0, 10)) return fail()

  if (!(await schoolIsActive(student.schoolId))) {
    return res.status(403).json({ error: 'This school account is disabled' })
  }

  const token = jwt.sign(
    { studentId: student._id, schoolId: student.schoolId, scope: 'student' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
  res.json({ token, user: await buildStudentProfile(student) })
}

// Session restore (page refresh): token-ka ayaa la hubiyaa oo profile-ka
// buuxa ayaa dib loo dhisaa, ma aha payload-ka ids kaliya.
async function me(req, res) {
  if (req.student) {
    const student = await Student.findOne({
      _id: req.student.studentId,
      schoolId: req.student.schoolId,
      lifecycleStatus: 'active',
    })
    if (!student) return res.status(401).json({ error: 'Account no longer active' })
    return res.json({ user: await buildStudentProfile(student) })
  }

  const user = await User.findOne({ _id: req.user.userId, schoolId: req.user.schoolId, isActive: true })
  if (!user) return res.status(401).json({ error: 'Account no longer active' })
  if (!(await schoolIsActive(user.schoolId))) {
    return res.status(403).json({ error: 'This school account is disabled' })
  }
  const { profile } = await buildStaffProfile(user)
  res.json({ user: profile })
}

// Admin ama macalin wuxuu beddelan karaa password-kiisa. Waxaa loo baahan
// yahay password-ka hadda jira (si qof token-ka helay uusan u beddeli karin).
// NOTE: khaladka password-ka hadda jira waa 400 (MA aha 401) — frontend-ka
// api.js 401 kasta wuu u tarjumaa "session dhacay" oo user-ka ayuu ka bixiyaa.
const MIN_NEW_PASSWORD = 8

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body
  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    !currentPassword ||
    !newPassword
  ) {
    return res.status(400).json({ error: 'Password-ka hadda jira iyo kan cusub labaduba waa loo baahan yahay' })
  }
  if (newPassword.length < MIN_NEW_PASSWORD) {
    return res.status(400).json({ error: `Password-ka cusub waa inuu ahaadaa ugu yaraan ${MIN_NEW_PASSWORD} xaraf` })
  }
  // bcrypt wuxuu akhriyaa 72 byte oo kaliya — kuwa dheer si aamaan ah u diid.
  if (Buffer.byteLength(newPassword, 'utf8') > 72) {
    return res.status(400).json({ error: 'Password-ka cusub aad buu u dheer yahay (ugu badnaan 72 xaraf)' })
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: 'Password-ka cusub waa inuu ka duwanaadaa kan hadda jira' })
  }

  const user = await User.findOne({ _id: req.user.userId, schoolId: req.user.schoolId, isActive: true })
  if (!user) return res.status(401).json({ error: 'Account no longer active' })
  if (!(await schoolIsActive(user.schoolId))) {
    return res.status(403).json({ error: 'This school account is disabled' })
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!ok) return res.status(400).json({ error: 'Password-ka hadda jira waa qaldan yahay' })

  user.passwordHash = await bcrypt.hash(newPassword, 10)
  await user.save()

  // Token cusub (isla payload-ka) si session-ka uusan u go'in.
  res.json({ message: 'Password-ka waa la beddelay', token: signStaffToken(user, req.user.teacherId) })
}

module.exports = { login, studentLogin, me, changePassword }
