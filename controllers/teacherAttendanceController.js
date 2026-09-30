const mongoose = require('mongoose')
const { TeacherAttendance, Teacher } = require('../models')

async function list(req, res) {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date is required' })

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const teachers = await Teacher.find({ schoolId: req.user.schoolId, isActive: true }).lean()

  // Bisha xarigga (date) ku jirta — loogu talagalay tirinta maqnaanshaha
  // bishan hal wac (ma aha wac gaar ah macalin kasta).
  const [year, mon] = date.slice(0, 7).split('-').map(Number)
  const monthStart = new Date(year, mon - 1, 1)
  const monthEnd = new Date(year, mon, 1)

  const [records, monthlyAbsences] = await Promise.all([
    TeacherAttendance.find({ schoolId: req.user.schoolId, date: { $gte: dayStart, $lt: dayEnd } }).lean(),
    TeacherAttendance.aggregate([
      {
        // aggregate() ma u beddesho string-ka ObjectId si toos ah (find() ayaa sameeya).
        $match: {
          schoolId: new mongoose.Types.ObjectId(req.user.schoolId),
          status: 'absent',
          date: { $gte: monthStart, $lt: monthEnd },
        },
      },
      { $group: { _id: '$teacherId', count: { $sum: 1 } } },
    ]),
  ])
  const recordByTeacherId = Object.fromEntries(records.map((r) => [String(r.teacherId), r]))
  const absencesByTeacherId = Object.fromEntries(monthlyAbsences.map((a) => [String(a._id), a.count]))

  res.json(
    teachers.map((t) => ({
      teacherId: t._id,
      name: t.fullName,
      status: recordByTeacherId[String(t._id)]?.status ?? null,
      absentDaysThisMonth: absencesByTeacherId[String(t._id)] ?? 0,
    }))
  )
}

async function mark(req, res) {
  const { teacherId, date, status } = req.body
  if (!teacherId || !date || !status) {
    return res.status(400).json({ error: 'teacherId, date, and status are required' })
  }

  // Tenant isolation: macalinku waa in uu ka tirsan yahay iskuulka admin-ka.
  const teacher = await Teacher.findOne({ _id: teacherId, schoolId: req.user.schoolId })
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' })

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)

  const record = await TeacherAttendance.findOneAndUpdate(
    { schoolId: req.user.schoolId, teacherId, date: dayStart },
    {
      schoolId: req.user.schoolId,
      teacherId,
      date: dayStart,
      status,
      markedByUserId: req.user.userId,
    },
    { new: true, upsert: true, runValidators: true }
  )
  res.status(201).json(record)
}

// GET /teachers/:id/absences?month=2026-09 (defaults to the current
// calendar month) — used on the teacher's info page: "how many days
// absent this month".
async function teacherAbsenceCount(req, res) {
  const teacher = await Teacher.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' })
const month = req.query.month || new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Mogadishu',
  year: 'numeric',
  month: '2-digit',
}).format(new Date()) // "YYYY-MM"
  const [year, mon] = month.split('-').map(Number)
  const monthStart = new Date(year, mon - 1, 1)
  const monthEnd = new Date(year, mon, 1)

  const count = await TeacherAttendance.countDocuments({
    schoolId: req.user.schoolId,
    teacherId: teacher._id,
    status: 'absent',
    date: { $gte: monthStart, $lt: monthEnd },
  })
  res.json({ absentDays: count, month })
}

module.exports = { list, mark, teacherAbsenceCount }
