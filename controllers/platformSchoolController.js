const bcrypt = require('bcryptjs')
const { School, SchoolSettings, User } = require('../models')

async function list(req, res) {
  const schools = await School.find().sort({ createdAt: -1 }).lean()
  const admins = await User.find({ role: 'admin', schoolId: { $in: schools.map((s) => s._id) } })
    .select('schoolId name email')
    .lean()
  const adminBySchoolId = Object.fromEntries(admins.map((a) => [String(a.schoolId), a]))

  res.json(
    schools.map((s) => ({
      ...s,
      adminName: adminBySchoolId[String(s._id)]?.name ?? null,
      adminEmail: adminBySchoolId[String(s._id)]?.email ?? null,
    }))
  )
}

// Kani waa isla habka aad sheegtay: iskuul cusub oo rabo systemka ("Iskuul
// Horseed") wuu kula soo xariiraa adiga (platform admin), adna waxaad
// abuurtaa School-kiisa + admin-kiisa ugu horreeya isku mar — admin-kaas
// ayaa dabadeed abuuri doona teachers/students-kiisa (routes-ka caadiga
// ah, /teachers /students, sida hore loo dhisay).
async function create(req, res) {
  const { schoolName, adminName, adminEmail, adminPassword } = req.body
  if (!schoolName || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'schoolName, adminName, adminEmail, and adminPassword are required' })
  }

  const school = await School.create({ name: schoolName })

  try {
    const settings = await SchoolSettings.create({
      schoolId: school._id,
      name: schoolName,
      defaultExamMaxMark: 100,
      defaultPassMark: 50,
      defaultStandardFeeAmount: 0,
    })

    const admin = await User.create({
      schoolId: school._id,
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: 'admin',
      name: adminName,
    })

    res.status(201).json({
      school: { id: school._id, name: school.name },
      admin: { id: admin._id, email: admin.email, name: admin.name },
      settings: { id: settings._id },
    })
  } catch (err) {
    // Rollback — isla sababta teacherController/studentController-ka:
    // MongoDB standalone ma taageerto transactions si fudud, sidaas
    // darteed School oo aan admin lahayn (aan la geli karin) waa in la
    // tirtiraa halkii la dayo.
    await SchoolSettings.deleteMany({ schoolId: school._id })
    await User.deleteMany({ schoolId: school._id })
    await School.deleteOne({ _id: school._id })
    throw err
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// PATCH: magaca iskuulka (+ SchoolSettings.name isla mar, si aanay isaga
// kala tagin), isActive (xidhid/furitaan — ma aha tirtirid, taariikhda
// admin-ka/ardayda/macallimiinta way sii jirtaa, kaliya login-kooda waa la
// joojiyaa), iyo/ama xogta ADMIN-KA iskuulkan (magaca, email-ka, password
// reset — waxaa loo baahan yahay marka admin-ku halmaamo password-kiisa ama
// email qalad la geliyay marka la abuurayay).
async function update(req, res) {
  const { name, isActive, adminName, adminEmail, adminPassword } = req.body
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: 'name must not be empty' })
  }
  if (adminName !== undefined && !String(adminName).trim()) {
    return res.status(400).json({ error: 'adminName must not be empty' })
  }
  if (adminEmail !== undefined && !EMAIL_RE.test(String(adminEmail).trim())) {
    return res.status(400).json({ error: 'adminEmail is not a valid email address' })
  }
  if (adminPassword !== undefined && adminPassword !== '' && String(adminPassword).length < 6) {
    return res.status(400).json({ error: 'adminPassword must be at least 6 characters' })
  }

  const school = await School.findById(req.params.id)
  if (!school) return res.status(404).json({ error: 'School not found' })

  if (name !== undefined) {
    school.name = String(name).trim()
    await SchoolSettings.updateOne({ schoolId: school._id }, { name: school.name })
  }
  if (isActive !== undefined) school.isActive = !!isActive
  await school.save()

  let admin = null
  if (adminName !== undefined || adminEmail !== undefined || adminPassword) {
    admin = await User.findOne({ schoolId: school._id, role: 'admin' })
    if (!admin) return res.status(404).json({ error: 'This school has no admin account to update' })
    if (adminName !== undefined) admin.name = String(adminName).trim()
    if (adminEmail !== undefined) admin.email = String(adminEmail).trim().toLowerCase()
    if (adminPassword) admin.passwordHash = await bcrypt.hash(String(adminPassword), 10)
    await admin.save()
  } else {
    admin = await User.findOne({ schoolId: school._id, role: 'admin' }).select('name email')
  }

  res.json({
    id: school._id,
    name: school.name,
    isActive: school.isActive,
    adminName: admin?.name ?? null,
    adminEmail: admin?.email ?? null,
  })
}

module.exports = { list, create, update }
