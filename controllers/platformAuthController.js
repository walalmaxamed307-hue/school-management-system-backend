const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { PlatformAdmin } = require('../models')

// NOTE: there is deliberately no signup endpoint for PlatformAdmin. This
// role is provisioned manually (by you, directly in the database or via a
// one-time script) — not something anyone can self-register into. See
// seed.js for how a dev/test PlatformAdmin gets created; in production
// that would be a one-off secure script, not left sitting in seed data.
async function login(req, res) {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  const admin = await PlatformAdmin.findOne({ email: email.toLowerCase().trim() })
  if (!admin) return res.status(401).json({ error: 'Invalid email or password' })

  const ok = await bcrypt.compare(password, admin.passwordHash)
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' })

  const token = jwt.sign(
    { platformAdminId: admin._id, scope: 'platform' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  )
  res.json({ token, admin: { id: admin._id, name: admin.name, email: admin.email } })
}

module.exports = { login }
