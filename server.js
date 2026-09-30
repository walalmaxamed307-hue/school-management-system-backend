// Step 1: connectDB wiring.
// Step 2: /auth routes (login, me) + central error handler.
// Step 3: master-data routes — /school-settings, /academic-years,
// /subjects, /rooms, /classes (+ its sections sub-resource).
// Data-integrity fix: verifyIndexes() now runs at startup and refuses to
// serve traffic if a unique constraint failed to build (see config/db.js
// for why that can happen silently otherwise, and scripts/findDuplicates.js
// to diagnose it).
// Step 4: /teachers, /students (creates User/Teacher/Enrollment/Scope
// together), and POST /classes/:id/bulk-assign-section for splitting an
// existing roster into sections retroactively.
// Step 5: /attendance (student, section-scoped), /teacher-attendance
// (staff, new model), /fees (paid/free/discount via Student.feeCategory).
// Also fixed pre-Step-5: TeacherAssignment now fully independent of
// homeroom; Student IDs are globally unique + server-generated
// (models/Counter.js); /platform routes for onboarding new schools.
// Step 6: /exams (terms), /exams/:id/results (marks, publish — mirrors
// the frontend's exact rules: subject-edit via TeacherAssignment,
// publish via TeacherAttendanceScope, rank/average computed the same way
// as lib/grading.js), /exams/:id/room-split (admin picks which classes
// participate; others untouched, pooled across sections), and
// /promotions/run (single-step promote-all, matching SettingsPage).
// Final pre-Step-8 pass: GET /dashboard/stats, GET /schools-directory +
// POST /students/:id/transfer (full cross-school transfer, matched by
// Class.level), lateDays added to /students/:id/absences, previousDayStatus
// added to GET /attendance (for sorting yesterday's absentees to the top).
// Step 7 (backend complete): /announcements, GET /students/graduates
// (graduated students have no active-year enrollment, so they needed
// their own query path). Plus a full audit pass — see API_REFERENCE.md
// for the complete endpoint list, business rules, and known gaps before
// starting Step 8 (frontend integration). Audit fixes: GET endpoints
// that take classId+sectionId now reject a sectioned class with no
// sectionId (attendance/fees/exam-results) instead of silently mixing
// every section's data together; promotionController's "repeated"
// branch now correctly creates the new-year Enrollment as 'active' (the
// 'repeated' status belongs on the OLD enrollment, recording history);
// feeController zeroes amountDue when a student is switched to 'free'
// after a Fee doc already exists for that month.

require('dotenv').config()
const express = require('express')
const path = require('path')
const { connectDB, verifyIndexes } = require('./config/db')
const authRoutes = require('./routes/auth')
const schoolSettingsRoutes = require('./routes/schoolSettings')
const academicYearRoutes = require('./routes/academicYears')
const subjectRoutes = require('./routes/subjects')
const roomRoutes = require('./routes/rooms')
const classRoutes = require('./routes/classes')
const teacherRoutes = require('./routes/teachers')
const studentRoutes = require('./routes/students')
const platformRoutes = require('./routes/platform')
const attendanceRoutes = require('./routes/attendance')
const teacherAttendanceRoutes = require('./routes/teacherAttendance')
const feeRoutes = require('./routes/fees')
const examRoutes = require('./routes/exams')
const myResultsRoutes = require('./routes/myResults')
const myRoomRoutes = require('./routes/myRoom')
const transferRoutes = require('./routes/transfers')
const promotionRoutes = require('./routes/promotions')
const announcementRoutes = require('./routes/announcements')
const schoolsDirectoryRoutes = require('./routes/schoolsDirectory')
const dashboardRoutes = require('./routes/dashboard')
const asyncHandler = require('./middleware/asyncHandler')
const { cors, securityHeaders } = require('./middleware/security')

// Fail fast: server-ku ha bilaabin haddii secret-ka la'yahay ama daciif yahay.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('\n❌ JWT_SECRET is missing or shorter than 16 characters. Set a long random value in .env')
  process.exit(1)
}
if (
  process.env.NODE_ENV === 'production' &&
  process.env.JWT_SECRET.startsWith('dev-only')
) {
  console.error('\n❌ Refusing to start in production with the dev-only JWT_SECRET from .env.example')
  process.exit(1)
}

const app = express()
// Haddii server-ku ka dambeeyo reverse proxy (Render, Nginx...), rate-limit-ku
// wuxuu u baahan yahay IP-ga dhabta ah: TRUST_PROXY=1
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1)
app.disable('x-powered-by')
app.use(securityHeaders)
app.use(cors)
app.use(express.json({ limit: '1mb' }))

app.use('/auth', authRoutes)
app.use('/platform', platformRoutes)
app.use('/school-settings', schoolSettingsRoutes)
app.use('/academic-years', academicYearRoutes)
app.use('/subjects', subjectRoutes)
app.use('/rooms', roomRoutes)
app.use('/classes', classRoutes)
app.use('/teachers', teacherRoutes)
app.use('/students', studentRoutes)
app.use('/attendance', attendanceRoutes)
app.use('/teacher-attendance', teacherAttendanceRoutes)
app.use('/fees', feeRoutes)
app.use('/exams', examRoutes)
app.use('/my-results', myResultsRoutes)
app.use('/my-room', myRoomRoutes)
app.use('/transfers', transferRoutes)
app.use('/promotions', promotionRoutes)
app.use('/announcements', announcementRoutes)
app.use('/schools-directory', schoolsDirectoryRoutes)
app.use('/dashboard', dashboardRoutes)

app.get('/health', (req, res) => {
  res.json({ ok: true, db: require('mongoose').connection.readyState === 1 ? 'connected' : 'not connected' })
})

// Qalab gaar ah oo platform owner-ku isticmaalo si uu iskuullo cusub ugu
// daro — gebi ahaanba ka madax-banaan React app-ka (dugsiga), sababtoo ah
// wuxuu isticmaalaa auth-scope kale (/platform/*). fur browser-ka:
// http://localhost:3000/platform-admin
app.get('/platform-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'platform-admin.html'))
})

// Error-handler dhexe — routes-ka (login-ku Teacher.findOne, Fee.create,
// iwm) waxay wataan mistakes-ka DB-ga marka la wado; halkan ayaa lagu
// hubiyaa in server-ku uusan si fool xun ah u dhicin (crash) haddii
// khalad aan la sugin dhaco. Steps-ka soo socda ayaa isticmaali doona
// isla kan (ma sameyneyno mid gaar ah route walba).
//
// Laba nooc oo khalad ah oo si joogto ah uga imanaya Mongoose ayaan
// halkan si gaar ah ugu qabanaynaa, halkii routes-ka mid waliba uu
// gacanta ugu qori lahaa: duplicate-key (11000, tusaale: Class magac
// horeyba jiray) iyo ValidationError (required/enum/pre-validate hooks).
app.use((err, req, res, next) => {
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {}).filter((k) => k !== 'schoolId')
    const labels = { email: 'Email-kan horeyba waa la isticmaalay', name: 'Magacan horeyba waa jiraa' }
    const message = labels[fields[0]] || 'A record with that value already exists'
    return res.status(409).json({ error: message, fields: err.keyValue })
  }
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message)
    return res.status(400).json({ error: messages.join('; ') })
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid ${err.path || 'value'}` })
  }
  if (err.status) {
    return res.status(err.status).json({ error: err.message })
  }
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

const PORT = process.env.PORT || 3000

connectDB()
  .then(async () => {
    await verifyIndexes()
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`)
      console.log('Try: curl http://localhost:3000/health')
      console.log('Try: curl http://localhost:3000/classes -H "Authorization: Bearer <token>"')
    })
  })
  .catch((err) => {
    console.error('\n❌ Server did not start:\n')
    console.error(err.message)
    process.exit(1)
  })
