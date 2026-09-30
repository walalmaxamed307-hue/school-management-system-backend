const jwt = require('jsonwebtoken')

// Deliberately a DIFFERENT token shape from the school-level auth
// middleware (middleware/auth.js): { platformAdminId, scope: 'platform' }.
// The scope field is what stops a normal school admin's token from being
// replayed here even if someone tried — a school User token has no
// scope:'platform', so it's rejected outright, not just "missing a role".
function authenticatePlatform(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }
  const token = header.slice('Bearer '.length)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.scope !== 'platform') {
      return res.status(403).json({ error: 'This endpoint requires a platform-admin token' })
    }
    req.platformAdmin = payload
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports = { authenticatePlatform }
