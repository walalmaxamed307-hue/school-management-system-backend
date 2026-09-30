// SEED = KALIYA xogta muhiimka ah ee systemku u baahan yahay inuu shaqeeyo:
// PLATFORM OWNER (platform admin-ka). MA abuurto iskuul, admin, macalin,
// arday, ama xog tusaale ah — iskuullada waxaa abuura platform admin-ka
// (platform-admin.html), admin-ka iskuulkuna isagaa abuura macallimiinta,
// ardayda iyo wixii kale.
//
// MUHIIM — ammaan:
//   * Email-ka iyo password-ka platform admin-ka waxaa laga akhriyaa .env
//     (PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD) — MA jiraan gudaha
//     koodhka, sidaas darteed GitHub ma gaaraan (.env waa ignore-garaysan).
//   * Seed-kani MA tirtiro wax xog ah. Waa nabdoon in la rooriso mar kasta,
//     xitaa production-ka: haddii platform admin-ku jiro, waxaa la
//     cusboonaysiiyaa (magac/password) si ay la mid noqdaan .env; haddii
//     kale waa la abuuraa.
//
// Usage:
//   cp .env.example .env   (beddel MONGODB_URI, JWT_SECRET, PLATFORM_ADMIN_*)
//   npm install
//   npm run seed

require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const { connectDB, verifyIndexes } = require('./config/db')
const { PlatformAdmin } = require('./models')

const MIN_PASSWORD_LENGTH = 8
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function readPlatformAdminEnv() {
  const email = (process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase()
  const password = process.env.PLATFORM_ADMIN_PASSWORD || ''
  const name = (process.env.PLATFORM_ADMIN_NAME || 'Platform Owner').trim()

  const problems = []
  if (!email) problems.push('PLATFORM_ADMIN_EMAIL is missing in .env')
  else if (!EMAIL_RE.test(email)) problems.push('PLATFORM_ADMIN_EMAIL is not a valid email address')
  if (!password) problems.push('PLATFORM_ADMIN_PASSWORD is missing in .env')
  else if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`PLATFORM_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
  if (problems.length > 0) {
    throw new Error('Cannot seed the platform admin:\n- ' + problems.join('\n- '))
  }
  return { email, password, name }
}

async function seed() {
  // Ka hor intaan database-ka la taaban, hubi in .env sax yahay.
  const { email, password, name } = readPlatformAdminEnv()

  await connectDB()
  console.log('Connected to', mongoose.connection.name)
  await verifyIndexes()

  const passwordHash = await bcrypt.hash(password, 10)
  const existing = await PlatformAdmin.findOne({ email })
  if (existing) {
    existing.name = name
    existing.passwordHash = passwordHash
    await existing.save()
    console.log(`Platform admin updated from .env: ${email}`)
  } else {
    await PlatformAdmin.create({ name, email, passwordHash })
    console.log(`Platform admin created: ${email}`)
  }

  const total = await PlatformAdmin.countDocuments()
  if (total > 1) {
    console.log(
      `Ogow: ${total} platform admin ayaa jira. Kuwa email-kooda aan .env ku jirin ma la beddelin — ` +
        'haddii aadan u baahnayn, ka tirtir Compass.'
    )
  }
  console.log('Seed complete. Wax iskuul ah lama abuurin — u isticmaal platform-admin.html.')
}

seed()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err.message)
    mongoose.disconnect().finally(() => process.exit(1))
  })
