const { Exam, Class, Room, Enrollment, RoomAssignment, RoomAttendance } = require('../models')

const validDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) && !Number.isNaN(new Date(`${date}T00:00:00`).getTime())

// Room allocation belongs to the term/exam, not a single day. Re-splitting a
// selected class replaces only that class's term allocation.
async function split(req, res) {
  const { classIds, roomIds } = req.body
  if (!Array.isArray(classIds) || classIds.length === 0 || !Array.isArray(roomIds) || roomIds.length === 0) {
    return res.status(400).json({ error: 'classIds and roomIds must be non-empty arrays' })
  }
  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!exam) return res.status(404).json({ error: 'Exam not found' })
  const [classCount, roomCount] = await Promise.all([
    Class.countDocuments({ _id: { $in: classIds }, schoolId: req.user.schoolId }),
    Room.countDocuments({ _id: { $in: roomIds }, schoolId: req.user.schoolId }),
  ])
  if (classCount !== classIds.length) return res.status(400).json({ error: 'One or more classIds are invalid' })
  if (roomCount !== roomIds.length) return res.status(400).json({ error: 'One or more roomIds are invalid' })
  const enrollments = await Enrollment.find({ schoolId: req.user.schoolId, academicYearId: exam.academicYearId, status: { $nin: ['transferred', 'withdrawn'] }, classId: { $in: classIds } })

  await RoomAssignment.deleteMany({ schoolId: req.user.schoolId, examId: exam._id, enrollmentId: { $in: enrollments.map((e) => e._id) } })
  const assignments = enrollments.map((enrollment, i) => ({ schoolId: req.user.schoolId, academicYearId: exam.academicYearId, examId: exam._id, enrollmentId: enrollment._id, roomId: roomIds[i % roomIds.length] }))
  await RoomAssignment.insertMany(assignments)
  res.json({ splitCount: assignments.length, classIds, roomIds })
}

async function getSplit(req, res) {
  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!exam) return res.status(404).json({ error: 'Exam not found' })
  const date = req.query.date
  if (date && !validDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  const [assignments, attendance] = await Promise.all([
    RoomAssignment.find({ schoolId: req.user.schoolId, examId: exam._id }).populate('roomId', 'name').populate({ path: 'enrollmentId', populate: { path: 'studentId', select: 'fullName studentCode' } }).lean(),
    date ? RoomAttendance.find({ schoolId: req.user.schoolId, examId: exam._id, date }).lean() : [],
  ])
  const attendanceByEnrollment = new Map(attendance.map((row) => [String(row.enrollmentId), row.status]))
  const seen = new Set()
  const byRoom = {}
  // Some old rows may exist from the short-lived date-allocation approach.
  // Return one allocation per student; the current room-attendance record
  // always takes precedence over the old single status field.
  for (const a of assignments) {
    const enrollmentId = String(a.enrollmentId?._id)
    if (seen.has(enrollmentId)) continue
    seen.add(enrollmentId)
    const roomName = a.roomId?.name ?? 'Unknown'
    byRoom[roomName] ??= []
    byRoom[roomName].push({ enrollmentId: a.enrollmentId?._id, studentId: a.enrollmentId?.studentId?._id, name: a.enrollmentId?.studentId?.fullName, studentCode: a.enrollmentId?.studentId?.studentCode, examStatus: attendanceByEnrollment.get(enrollmentId) ?? (date ? null : a.examStatus) })
  }
  res.json(byRoom)
}

async function update(req, res) {
  const { roomId, examStatus, attendanceDate } = req.body
  if (roomId === undefined && examStatus === undefined) return res.status(400).json({ error: 'roomId or examStatus is required' })
  if (examStatus !== undefined && !['present', 'absent', null].includes(examStatus)) return res.status(400).json({ error: 'examStatus must be present, absent, or null' })
  if (examStatus !== undefined && !validDate(attendanceDate)) return res.status(400).json({ error: 'attendanceDate must be YYYY-MM-DD' })
  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!exam) return res.status(404).json({ error: 'Exam not found' })
  const enrollment = await Enrollment.findOne({ _id: req.params.enrollmentId, schoolId: req.user.schoolId })
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' })
  if (['transferred', 'withdrawn'].includes(enrollment.status)) return res.status(400).json({ error: 'This student is no longer enrolled in this school' })

  let assignment = await RoomAssignment.findOne({ schoolId: req.user.schoolId, examId: exam._id, enrollmentId: enrollment._id })
  if (!assignment) {
    if (roomId === undefined) return res.status(400).json({ error: 'roomId is required to assign a room for the first time' })
    const room = await Room.findOne({ _id: roomId, schoolId: req.user.schoolId })
    if (!room) return res.status(400).json({ error: 'roomId does not reference a room in this school' })
    assignment = await RoomAssignment.create({ schoolId: req.user.schoolId, academicYearId: exam.academicYearId, examId: exam._id, enrollmentId: enrollment._id, roomId: room._id })
  } else if (roomId !== undefined) {
    const room = await Room.findOne({ _id: roomId, schoolId: req.user.schoolId })
    if (!room) return res.status(400).json({ error: 'roomId does not reference a room in this school' })
    assignment.roomId = room._id
    await assignment.save()
  }
  if (examStatus !== undefined) {
    if (examStatus === null) await RoomAttendance.deleteOne({ schoolId: req.user.schoolId, examId: exam._id, enrollmentId: enrollment._id, date: attendanceDate })
    else await RoomAttendance.findOneAndUpdate({ schoolId: req.user.schoolId, examId: exam._id, enrollmentId: enrollment._id, date: attendanceDate }, { $set: { status: examStatus } }, { upsert: true, new: true, setDefaultsOnInsert: true })
  }
  res.json({ enrollmentId: assignment.enrollmentId, roomId: assignment.roomId, examStatus: examStatus ?? null })
}

module.exports = { split, getSplit, update }
