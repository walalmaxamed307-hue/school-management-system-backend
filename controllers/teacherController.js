const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')
const {
  User,
  Teacher,
  TeacherAttendanceScope,
  TeacherAssignment,
  AcademicYear,
  Class,
  Section,
  Subject,
} = require('../models')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 6

function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

async function getActiveYear(schoolId) {
  return AcademicYear.findOne({ schoolId, status: 'active' })
}

const idOf = (v) => (v === undefined || v === null || v === '' ? null : String(v))

// Hubinta tenant-ka: fasal/section/maado kasta oo jira homeroom-ka ama
// assignments-ka waa in ay ka tirsan yihiin iskuulka admin-ka. Haddii aan
// halkan la hubin, admin iskuul B wuxuu isticmaali karay classId iskuul A.
async function validateRefs(schoolId, homeroom, assignments) {
  const classIds = new Set()
  const sectionIds = new Set()
  const subjectIds = new Set()

  if (homeroom) {
    if (!idOf(homeroom.classId)) throw httpError(400, 'homeroom.classId is required')
    classIds.add(idOf(homeroom.classId))
    if (idOf(homeroom.sectionId)) sectionIds.add(idOf(homeroom.sectionId))
  }
  for (const a of assignments || []) {
    if (!idOf(a.classId) || !idOf(a.subjectId)) {
      throw httpError(400, 'Each assignment needs classId and subjectId')
    }
    classIds.add(idOf(a.classId))
    subjectIds.add(idOf(a.subjectId))
    if (idOf(a.sectionId)) sectionIds.add(idOf(a.sectionId))
  }

  for (const id of [...classIds, ...sectionIds, ...subjectIds]) {
    if (!mongoose.isValidObjectId(id)) throw httpError(400, 'Invalid id in homeroom/assignments')
  }

  const [classes, sections, subjects] = await Promise.all([
    Class.find({ _id: { $in: [...classIds] }, schoolId }).lean(),
    Section.find({ _id: { $in: [...sectionIds] }, schoolId }).lean(),
    Subject.find({ _id: { $in: [...subjectIds] }, schoolId }).lean(),
  ])
  if (classes.length !== classIds.size) throw httpError(400, 'One or more classes are invalid')
  if (sections.length !== sectionIds.size) throw httpError(400, 'One or more sections are invalid')
  if (subjects.length !== subjectIds.size) throw httpError(400, 'One or more subjects are invalid')

  const sectionById = Object.fromEntries(sections.map((s) => [String(s._id), s]))
  const classById = Object.fromEntries(classes.map((c) => [String(c._id), c]))
  const checkPair = (classId, sectionId, label) => {
    if (sectionId && String(sectionById[sectionId].classId) !== classId) {
      throw httpError(400, `${label}: section does not belong to that class`)
    }
  }
  if (homeroom) {
    const cid = idOf(homeroom.classId)
    const sid = idOf(homeroom.sectionId)
    checkPair(cid, sid, 'homeroom')
    if (classById[cid].hasSections && !sid) {
      throw httpError(400, `homeroom: ${classById[cid].name} has sections — a section is required`)
    }
    if (!classById[cid].hasSections && sid) {
      throw httpError(400, `homeroom: ${classById[cid].name} has no sections`)
    }
  }
  for (const a of assignments || []) checkPair(idOf(a.classId), idOf(a.sectionId), 'assignment')
}

function dedupeAssignments(assignments) {
  const seen = new Set()
  const out = []
  for (const a of assignments || []) {
    const key = `${idOf(a.classId)}|${idOf(a.sectionId)}|${idOf(a.subjectId)}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(a)
    }
  }
  return out
}

async function list(req, res) {
  const isAdmin = req.user.role === 'admin'
  const filter = { schoolId: req.user.schoolId }
  if (req.query.includeInactive !== '1') filter.isActive = true

  const teachers = await Teacher.find(filter).sort({ fullName: 1 }).lean()
  const users = await User.find({
    _id: { $in: teachers.map((t) => t.userId) },
    schoolId: req.user.schoolId,
  }).lean()
  const usersById = Object.fromEntries(users.map((u) => [String(u._id), u]))

  const activeYear = await getActiveYear(req.user.schoolId)
  const [scopes, assignments] = activeYear
    ? await Promise.all([
        TeacherAttendanceScope.find({ schoolId: req.user.schoolId, academicYearId: activeYear._id })
          .populate('classId', 'name')
          .populate('sectionId', 'name')
          .lean(),
        TeacherAssignment.find({ schoolId: req.user.schoolId, academicYearId: activeYear._id })
          .populate('classId', 'name')
          .populate('sectionId', 'name')
          .populate('subjectId', 'name')
          .lean(),
      ])
    : [[], []]
  const scopeByTeacherId = Object.fromEntries(scopes.map((s) => [String(s.teacherId), s]))

  res.json(
    teachers.map((t) => {
      const scope = scopeByTeacherId[String(t._id)]
      const own = assignments.filter((a) => String(a.teacherId) === String(t._id))
      return {
        id: t._id,
        name: t.fullName,
        // Email/telefoon: admin kaliya (macallimiinta kale ma u baahna).
        phone: isAdmin ? t.phone : undefined,
        email: isAdmin ? usersById[String(t.userId)]?.email : undefined,
        isActive: t.isActive,
        // Homeroom (attendance) — mid keliya, ma aha liis.
        class: scope?.classId?.name ?? null,
        section: scope?.sectionId?.name ?? null,
        classId: scope?.classId?._id ?? null,
        sectionId: scope?.sectionId?._id ?? null,
        // Subject-teaching — liis, gebi ahaanba ka madax-banaan homeroom-ka.
        assignments: own.map((a) => ({
          classId: a.classId?._id ?? null,
          sectionId: a.sectionId?._id ?? null,
          subjectId: a.subjectId?._id ?? null,
          class: a.classId?.name,
          section: a.sectionId?.name ?? null,
          subject: a.subjectId?.name,
        })),
      }
    })
  )
}

// Isku mar wuxuu abuuraa User + Teacher, iyo ikhtiyaari ahaan:
// - homeroom: { classId, sectionId? } -> hal TeacherAttendanceScope
// - assignments: [{ classId, sectionId?, subjectId }, ...] -> hal
//   TeacherAssignment mid kasta, GEBI AHAANBA KA MADAX-BANAAN homeroom-ka.
async function create(req, res) {
  const { email, password, name, phone, homeroom } = req.body
  const assignments = dedupeAssignments(req.body.assignments)
  if (!email || !password || !name || !String(name).trim()) {
    return res.status(400).json({ error: 'email, password, and name are required' })
  }
  if (!EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'email is not a valid email address' })
  }
  if (String(password).length < MIN_PASSWORD) {
    return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD} characters` })
  }

  const wantsYearData = !!homeroom?.classId || assignments.length > 0
  const activeYear = wantsYearData ? await getActiveYear(req.user.schoolId) : null
  if (wantsYearData && !activeYear) {
    return res.status(400).json({ error: 'No active academic year — cannot assign classes/subjects' })
  }
  await validateRefs(req.user.schoolId, homeroom?.classId ? homeroom : null, assignments)

  const user = await User.create({
    schoolId: req.user.schoolId,
    email,
    passwordHash: await bcrypt.hash(String(password), 10),
    role: 'teacher',
  })

  let teacher
  try {
    teacher = await Teacher.create({
      schoolId: req.user.schoolId,
      userId: user._id,
      fullName: String(name).trim(),
      phone,
    })
  } catch (err) {
    await User.deleteOne({ _id: user._id })
    throw err
  }

  // MongoDB standalone ma taageerto transactions si fudud — rollback-ku waa
  // gacan (delete wixii la abuuray) haddii mid ka mid ah uu fashilmo.
  try {
    if (homeroom?.classId) {
      await TeacherAttendanceScope.create({
        schoolId: req.user.schoolId,
        academicYearId: activeYear._id,
        teacherId: teacher._id,
        scopeType: 'single_class',
        classId: homeroom.classId,
        sectionId: idOf(homeroom.sectionId) || undefined,
      })
    }
    for (const a of assignments) {
      await TeacherAssignment.create({
        schoolId: req.user.schoolId,
        academicYearId: activeYear._id,
        teacherId: teacher._id,
        classId: a.classId,
        sectionId: idOf(a.sectionId) || undefined,
        subjectId: a.subjectId,
      })
    }
  } catch (err) {
    await TeacherAssignment.deleteMany({ teacherId: teacher._id })
    await TeacherAttendanceScope.deleteMany({ teacherId: teacher._id })
    await Teacher.deleteOne({ _id: teacher._id })
    await User.deleteOne({ _id: user._id })
    throw err
  }

  res.status(201).json({ id: teacher._id, name: teacher.fullName, email: user.email })
}

// Macalin waa la xidhaa (deactivate), lama tirtiro: taariikhda (attendance,
// natiijooyin) waa in ay sii jirto. Login-kiisa waa la joojiyaa, homeroom-kiisa
// iyo assignments-kiisa sanadka hadda waa la bakhtiyaa si section-kiisa
// macalin kale loo siin karo.
async function deactivate(schoolId, teacher) {
  teacher.isActive = false
  await teacher.save()
  await User.updateOne({ _id: teacher.userId, schoolId }, { isActive: false })
  const activeYear = await getActiveYear(schoolId)
  if (activeYear) {
    await TeacherAttendanceScope.deleteMany({ schoolId, academicYearId: activeYear._id, teacherId: teacher._id })
    await TeacherAssignment.deleteMany({ schoolId, academicYearId: activeYear._id, teacherId: teacher._id })
  }
}

// PATCH: name, phone, email, password (reset), isActive, homeroom (fasal ama
// null), assignments (liiska oo dhan waa la bedelayaa). Field aan la soo
// dirin waa la taabanayn.
async function update(req, res) {
  const { name, phone, email, password, isActive, homeroom } = req.body
  const schoolId = req.user.schoolId

  const teacher = await Teacher.findOne({ _id: req.params.id, schoolId })
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' })
  const user = await User.findOne({ _id: teacher.userId, schoolId })
  if (!user) return res.status(404).json({ error: 'Teacher account not found' })

  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: 'name must not be empty' })
  }
  if (email !== undefined && !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'email is not a valid email address' })
  }
  const newPassword = password === undefined || password === '' ? null : String(password)
  if (newPassword && newPassword.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD} characters` })
  }

  const assignments = req.body.assignments === undefined ? undefined : dedupeAssignments(req.body.assignments)
  const changesYearData = homeroom !== undefined || assignments !== undefined
  const activeYear = changesYearData ? await getActiveYear(schoolId) : null
  if (changesYearData && !activeYear && (homeroom || (assignments && assignments.length > 0))) {
    return res.status(400).json({ error: 'No active academic year — cannot assign classes/subjects' })
  }
  if (changesYearData) {
    await validateRefs(schoolId, homeroom?.classId ? homeroom : null, assignments)
  }

  // 1) Account fields (email unique => 11000 => 409 ka hor wax kale la beddelin)
  if (email !== undefined || newPassword) {
    if (email !== undefined) user.email = String(email).trim().toLowerCase()
    if (newPassword) user.passwordHash = await bcrypt.hash(newPassword, 10)
    await user.save()
  }
  if (name !== undefined) teacher.fullName = String(name).trim()
  if (phone !== undefined) teacher.phone = phone
  await teacher.save()

  // 2) Homeroom + assignments (snapshot -> haddii cilad dhacdo, dib u soo celi)
  if (changesYearData && activeYear) {
    const scopeFilter = { schoolId, academicYearId: activeYear._id, teacherId: teacher._id }
    const oldScope = homeroom !== undefined ? await TeacherAttendanceScope.find(scopeFilter).lean() : []
    const oldAssign = assignments !== undefined ? await TeacherAssignment.find(scopeFilter).lean() : []
    try {
      if (homeroom !== undefined) {
        await TeacherAttendanceScope.deleteMany(scopeFilter)
        if (homeroom?.classId) {
          await TeacherAttendanceScope.create({
            ...scopeFilter,
            scopeType: 'single_class',
            classId: homeroom.classId,
            sectionId: idOf(homeroom.sectionId) || undefined,
          })
        }
      }
      if (assignments !== undefined) {
        await TeacherAssignment.deleteMany(scopeFilter)
        for (const a of assignments) {
          await TeacherAssignment.create({
            ...scopeFilter,
            classId: a.classId,
            sectionId: idOf(a.sectionId) || undefined,
            subjectId: a.subjectId,
          })
        }
      }
    } catch (err) {
      if (homeroom !== undefined) {
        await TeacherAttendanceScope.deleteMany(scopeFilter)
        if (oldScope.length) await TeacherAttendanceScope.insertMany(oldScope)
      }
      if (assignments !== undefined) {
        await TeacherAssignment.deleteMany(scopeFilter)
        if (oldAssign.length) await TeacherAssignment.insertMany(oldAssign)
      }
      throw err
    }
  }

  // 3) Active flag (kan ugu dambeeya sababtoo ah wuxuu tirtiraa homeroom-ka)
  if (isActive === false && teacher.isActive) await deactivate(schoolId, teacher)
  if (isActive === true && !teacher.isActive) {
    teacher.isActive = true
    await teacher.save()
    await User.updateOne({ _id: teacher.userId, schoolId }, { isActive: true })
  }

  res.json({ id: teacher._id, name: teacher.fullName, email: user.email, isActive: teacher.isActive })
}

async function remove(req, res) {
  const teacher = await Teacher.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' })
  if (teacher.isActive) await deactivate(req.user.schoolId, teacher)
  res.status(204).end()
}

module.exports = { list, create, update, remove }
