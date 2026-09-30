const jwt = require('jsonwebtoken')

function readBearer(req) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length)
}

// Token kinds (same secret, told apart by `scope`):
//   staff    -> { userId, schoolId, role, teacherId? }        (no scope)
//   student  -> { studentId, schoolId, scope: 'student' }
//   platform -> { platformAdminId, scope: 'platform' }
// `authenticate` accepts STAFF tokens only. Student/platform tokens are
// rejected here, otherwise a student (or platform) token would pass
// verification and reach every "any role" route (e.g. GET /students,
// which lists every student's parent phone number).
function authenticate(req, res, next) {
  const token = readBearer(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.scope || !payload.userId || !payload.schoolId) {
      return res.status(403).json({ error: 'This endpoint requires a school staff token' })
    }
    req.user = payload
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Student-portal endpoints only.
function authenticateStudent(req, res, next) {
  const token = readBearer(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.scope !== 'student' || !payload.studentId || !payload.schoolId) {
      return res.status(403).json({ error: 'This endpoint requires a student token' })
    }
    req.student = payload
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Used by GET /auth/me only: accepts staff OR student, so the frontend can
// restore either kind of session after a page refresh.
function authenticateSession(req, res, next) {
  const token = readBearer(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.scope === 'student') {
      req.student = payload
    } else if (!payload.scope && payload.userId && payload.schoolId) {
      req.user = payload
    } else {
      return res.status(403).json({ error: 'Unsupported token' })
    }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Usage: requireRole('admin') or requireRole('admin', 'teacher')
function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${allowedRoles.join(' or ')}` })
    }
    next()
  }
}

module.exports = { authenticate, authenticateStudent, authenticateSession, requireRole }
