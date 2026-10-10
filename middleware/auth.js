const jwt = require('jsonwebtoken')
const { User, School, Teacher } = require('../models')

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
    // DENY-BY-DEFAULT: milkiilaha iskuulka (role 'owner') wuxuu arki karaa
    // /owner/* kaliya (authenticateOwner). Halkan waa laga diiday, si route
    // kasta oo hore u jiray (oo ay ku jiraan kuwa "any staff" ah) uusan
    // owner u furmin — xitaa haddii route-ka dambe lagu daro role check la'aan.
    if (payload.role === 'owner') {
      return res.status(403).json({ error: 'Owner accounts can only access the owner dashboard' })
    }
    req.user = payload
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Sida authenticate, laakiin owner-ka sidoo kale wuu ogol yahay. Isticmaal
// KALIYA route-yada lagu wadaago (change-password).
function authenticateStaffOrOwner(req, res, next) {
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

// Owner-dashboard endpoints only (/owner/*). Ka sokow authenticate-ka kale,
// halkan DB-ga ayaa la eegaa wicitaan kasta: owner la joojiyay ama iskuul
// la xiray token-kiisa isla markiiba wuu dhacayaa (ma sugayo 7 maalmood).
async function authenticateOwner(req, res, next) {
  const token = readBearer(req)
  if (!token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }
  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  if (payload.scope || !payload.userId || !payload.schoolId || payload.role !== 'owner') {
    return res.status(403).json({ error: 'This endpoint requires an owner token' })
  }
  try {
    const user = await User.findOne({ _id: payload.userId, schoolId: payload.schoolId, role: 'owner', isActive: true })
    if (!user) return res.status(401).json({ error: 'Account no longer active' })
    const school = await School.findById(payload.schoolId).select('isActive')
    if (!school || school.isActive === false) {
      return res.status(403).json({ error: 'This school account is disabled' })
    }
    req.user = payload
    next()
  } catch (err) {
    next(err)
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
async function requireFeeAccess(req, res, next) {
  if (req.user.role === 'admin') return next()

  // isFeeManager kuma jiro JWT-ga si isbeddelka admin-ku sameeyo uusan
  // u sugin token cusub (token-ku 7 maalmood ayuu jiri karaa). DB-ga ayaan
  // ka xaqiijinnaa request kasta oo Fees ah.
  if (req.user.role === 'teacher') {
    try {
      const teacher = await Teacher.findOne({
        _id: req.user.teacherId,
        userId: req.user.userId,
        schoolId: req.user.schoolId,
        isActive: true,
      }).select('isFeeManager').lean()
      if (teacher?.isFeeManager === true) return next()
    } catch (err) {
      return next(err)
    }
  }

  return res.status(403).json({ error: 'Fee access is required' })
}
module.exports = {
  authenticate,
  authenticateStaffOrOwner,
  authenticateOwner,
  authenticateStudent,
  authenticateSession,
  requireRole,
  requireFeeAccess,
}
