// Dependency-free: CORS, security headers, iyo login rate-limit. (Haddii
// mustaqbalka dhowr server la wado, rate-limit-ka in-memory-ga ah waa in
// lagu beddelaa mid la wadaago, tusaale Redis.)

// CORS_ORIGINS = liis comma-separated ah oo origins-ka frontend-ka ah, tusaale
// "https://app.iskuulkaaga.so,http://localhost:5173".
function parseOrigins() {
  const raw = process.env.CORS_ORIGINS || 'http://localhost:5173'
  return raw.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)
}

function cors(req, res, next) {
  const allowed = parseOrigins()
  const origin = req.headers.origin
  if (origin && allowed.includes(origin.replace(/\/$/, ''))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Max-Age', '600')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
}

// LOGIN RATE-LIMIT — ka hortag brute-force (password/DOB qiyaas).
// Xeerka: ugu badnaan 5 isku-day (LOGIN_MAX_ATTEMPTS) / 15 daqiiqo, ee
// IP + account (email ama studentCode) isku mid ah. Isku-dayga lixaad wuxuu
// helayaa 429 ilaa daqiiqadaha ay dhamaadaan.
//   * Login guulaystay (200) wuu nadiifiyaa tirada account-kaas — qof sax ah
//     ma xidhmo.
//   * Halkan waxaa loo tirinayaa account kasta gooni (ma aha IP oo keliya),
//     sababtoo ah IP-ga iskuul dhan (WiFi) waa mid — hadday IP oo keliya
//     ahaan lahayd, 5 arday oo isku waqti galaya ayaa xidhi lahaa iskuulka
//     oo dhan.
//   * Waxaa sidoo kale jira daboolid IP oo dhan (LOGIN_MAX_ATTEMPTS_PER_IP,
//     20 isku-day oo fashilmay/15 daqiiqo) si loo joojiyo qof isku dayaya
//     account badan (credential stuffing). Login guulaystay kuma xisaabtamo.
// In-memory: hal server keliya. Haddii dhowr server la wado, u beddel Redis.
// Marka ka dambeeya reverse proxy (Render/Railway...) SET TRUST_PROXY=1, si
// req.ip uu noqdo IP-ga dhabta ah ee isticmaalaha.
const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_ACCOUNT = Number(process.env.LOGIN_MAX_ATTEMPTS) || 5
const MAX_PER_IP = Number(process.env.LOGIN_MAX_ATTEMPTS_PER_IP) || 20
const hits = new Map()

function bump(key, now) {
  let entry = hits.get(key)
  if (!entry || now - entry.start > WINDOW_MS) {
    entry = { start: now, count: 0 }
    hits.set(key, entry)
  }
  entry.count += 1
  return entry
}

function loginLimiter(req, res, next) {
  const now = Date.now()
  const identifier = String(req.body?.email ?? req.body?.studentCode ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 200)
  const accountKey = `acct|${req.ip}|${req.baseUrl}${req.path}|${identifier}`
  const ipKey = `ip|${req.ip}`

  const account = bump(accountKey, now)
  const ip = bump(ipKey, now)

  const blocked = account.count > MAX_PER_ACCOUNT ? account : ip.count > MAX_PER_IP ? ip : null
  if (blocked) {
    const retrySeconds = Math.max(1, Math.ceil((blocked.start + WINDOW_MS - now) / 1000))
    res.setHeader('Retry-After', String(retrySeconds))
    return res.status(429).json({
      error: `Isku-day badan. Fadlan ${Math.ceil(retrySeconds / 60)} daqiiqo kadib isku day.`,
    })
  }

  // Login guulaystay: nadiifi account-ka, oo ha ku darin IP-ga (qof kale oo isla
  // IP ah ha loo xidhin).
  res.on('finish', () => {
    if (res.statusCode < 400) {
      hits.delete(accountKey)
      ip.count = Math.max(0, ip.count - 1)
    }
  })
  next()
}

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k)
}, WINDOW_MS).unref()


// PASSWORD-CHANGE RATE-LIMIT — qof leh token la xaday ma qiyaasi karo password-ka
// hadda jira. Ugu badnaan 5 isku-day / 15 daqiiqo user kasta (PASSWORD_CHANGE_MAX_ATTEMPTS).
// Beddel guulaystay wuxuu nadiifiyaa tirada. In-memory (hal server) — sida loginLimiter.
const MAX_PASSWORD_CHANGES = Number(process.env.PASSWORD_CHANGE_MAX_ATTEMPTS) || 5
const changeHits = new Map()

function changePasswordLimiter(req, res, next) {
  const now = Date.now()
  const key = String(req.user?.userId || req.ip)
  let entry = changeHits.get(key)
  if (!entry || now - entry.start > WINDOW_MS) {
    entry = { start: now, count: 0 }
    changeHits.set(key, entry)
  }
  entry.count += 1

  if (entry.count > MAX_PASSWORD_CHANGES) {
    const retrySeconds = Math.max(1, Math.ceil((entry.start + WINDOW_MS - now) / 1000))
    res.setHeader('Retry-After', String(retrySeconds))
    return res.status(429).json({
      error: `Isku-day badan. Fadlan ${Math.ceil(retrySeconds / 60)} daqiiqo kadib isku day.`,
    })
  }

  res.on('finish', () => {
    if (res.statusCode < 400) changeHits.delete(key)
  })
  next()
}

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of changeHits) if (now - v.start > WINDOW_MS) changeHits.delete(k)
}, WINDOW_MS).unref()

module.exports = { cors, securityHeaders, loginLimiter, changePasswordLimiter }
