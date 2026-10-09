const bcrypt = require('bcryptjs')
const { User } = require('../models')

// Akoonnada MILKIILAHA iskuulka — admin ayaa abuura (email + password kaliya).
// Owner-ku waa READ-ONLY: wuxuu arkaa dashboard-ka /owner kaliya (auth.js).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8
const MAX_PASSWORD_BYTES = 72 // bcrypt wuxuu ka gooyaa wixii ka badan

const shape = (u) => ({ id: u._id, email: u.email, isActive: u.isActive, createdAt: u.createdAt })

// Soo celisaa fariin khalad ah ama null.
function validatePassword(password) {
  if (typeof password !== 'string' || !password) return 'Password waa loo baahan yahay'
  if (password.length < MIN_PASSWORD) return `Password-ku waa inuu ugu yaraan ${MIN_PASSWORD} xaraf yahay`
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return `Password-ku aad buu u dheer yahay (ugu badnaan ${MAX_PASSWORD_BYTES} byte)`
  return null
}

async function list(req, res) {
  const owners = await User.find({ schoolId: req.user.schoolId, role: 'owner' }).sort({ createdAt: -1 }).lean()
  res.json(owners.map(shape))
}

async function create(req, res) {
  const { email, password } = req.body || {}
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Email sax ah geli' })
  }
  const problem = validatePassword(password)
  if (problem) return res.status(400).json({ error: problem })

  // Email-ku waa GLOBALLY unique (User.js) — duplicate wuxuu tagayaa
  // error-handler-ka dhexe (409).
  const user = await User.create({
    schoolId: req.user.schoolId,
    email: email.trim(),
    passwordHash: await bcrypt.hash(password, 10),
    role: 'owner',
  })
  res.status(201).json(shape(user))
}

// PATCH: password (reset) iyo/ama isActive (joojin/dib u furid).
async function update(req, res) {
  const { password, isActive } = req.body || {}
  if (password === undefined && isActive === undefined) {
    return res.status(400).json({ error: 'password ama isActive ayaa loo baahan yahay' })
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive waa inuu boolean yahay' })
  }
  const owner = await User.findOne({ _id: req.params.id, schoolId: req.user.schoolId, role: 'owner' })
  if (!owner) return res.status(404).json({ error: 'Owner lama helin' })

  const set = {}
  if (password !== undefined) {
    const problem = validatePassword(password)
    if (problem) return res.status(400).json({ error: problem })
    set.passwordHash = await bcrypt.hash(password, 10)
  }
  if (isActive !== undefined) set.isActive = isActive
  await User.updateOne({ _id: owner._id, schoolId: owner.schoolId }, set)
  res.json(shape({ ...owner.toObject(), ...set }))
}

async function remove(req, res) {
  const result = await User.deleteOne({ _id: req.params.id, schoolId: req.user.schoolId, role: 'owner' })
  if (result.deletedCount === 0) return res.status(404).json({ error: 'Owner lama helin' })
  res.json({ ok: true })
}

module.exports = { list, create, update, remove, validatePassword }
