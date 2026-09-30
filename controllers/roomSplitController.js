const { Exam, Class, Room, Enrollment, RoomAssignment } = require('../models')

// Isla sidii aad sheegtay: fasalada aan la doorin waxba lagama qabtaan
// (lama kala qaybin) — kaliya fasalada la sheegay ayaa la isku daraa oo
// si isku mid ah loogu qaybiyaa rooms-ka la doortay, iyada oo aan sections
// la eegayn (room-ku waa pool guud, sida hore loo go'aamiyay).
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

  const enrollments = await Enrollment.find({
    schoolId: req.user.schoolId,
    academicYearId: exam.academicYearId,
    status: { $ne: 'transferred' }, // arday la wareejiyay looma qaybiyo qol imtixaan
    classId: { $in: classIds },
  })

  // Fasalada la doortay kaliya ayaa la nadiifinayaa — fasalo aan la
  // doorin ee horeyba room loo qoondeeyay (exam-kan) waxba kama beddelayo.
  await RoomAssignment.deleteMany({
    schoolId: req.user.schoolId,
    examId: exam._id,
    enrollmentId: { $in: enrollments.map((e) => e._id) },
  })

  // Round-robin — pool guud, ma aha class kasta oo gaar ah room la siiyo.
  const assignments = enrollments.map((enrollment, i) => ({
    schoolId: req.user.schoolId,
    academicYearId: exam.academicYearId,
    examId: exam._id,
    enrollmentId: enrollment._id,
    roomId: roomIds[i % roomIds.length],
  }))
  await RoomAssignment.insertMany(assignments)

  res.json({ splitCount: assignments.length, classIds, roomIds })
}

async function getSplit(req, res) {
  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!exam) return res.status(404).json({ error: 'Exam not found' })

  const assignments = await RoomAssignment.find({ schoolId: req.user.schoolId, examId: exam._id })
    .populate('roomId', 'name')
    .populate({ path: 'enrollmentId', populate: { path: 'studentId', select: 'fullName studentCode' } })
    .lean()

  const byRoom = {}
  for (const a of assignments) {
    const roomName = a.roomId?.name ?? 'Unknown'
    byRoom[roomName] ??= []
    byRoom[roomName].push({
      enrollmentId: a.enrollmentId?._id,
      studentId: a.enrollmentId?.studentId?._id,
      name: a.enrollmentId?.studentId?.fullName,
      studentCode: a.enrollmentId?.studentId?.studentCode,
      examStatus: a.examStatus,
    })
  }
  res.json(byRoom)
}

// Wax-ka-beddel hal arday: guuri room kale ama calaamadi present/absent
// maalinta imtixaanka. Mid keliya oo kasta — ma aha dhammaan fasalka.
async function update(req, res) {
  const { roomId, examStatus } = req.body
  if (roomId === undefined && examStatus === undefined) {
    return res.status(400).json({ error: 'roomId or examStatus is required' })
  }
  if (examStatus !== undefined && !['present', 'absent', null].includes(examStatus)) {
    return res.status(400).json({ error: 'examStatus must be present, absent, or null' })
  }

  const exam = await Exam.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!exam) return res.status(404).json({ error: 'Exam not found' })

  const enrollment = await Enrollment.findOne({ _id: req.params.enrollmentId, schoolId: req.user.schoolId })
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' })

  let assignment = await RoomAssignment.findOne({
    schoolId: req.user.schoolId,
    examId: exam._id,
    enrollmentId: req.params.enrollmentId,
  })

  // Ardayda aan weli room la siin (tusaale: la diiwaangeliyay split-ka kadib)
  // — waxaa loo abuuraa mid cusub halkii la diidi lahaa (upsert), si admin-ku
  // uga qaybin karo hal-hal, ma aha kaliya kala-qaybinta guud.
  if (!assignment) {
    if (roomId === undefined) {
      return res.status(400).json({ error: 'roomId is required to assign a room for the first time' })
    }
    const room = await Room.findOne({ _id: roomId, schoolId: req.user.schoolId })
    if (!room) return res.status(400).json({ error: 'roomId does not reference a room in this school' })
    assignment = await RoomAssignment.create({
      schoolId: req.user.schoolId,
      academicYearId: exam.academicYearId,
      examId: exam._id,
      enrollmentId: enrollment._id,
      roomId: room._id,
      examStatus: examStatus ?? undefined,
    })
    return res.json({ enrollmentId: assignment.enrollmentId, roomId: assignment.roomId, examStatus: assignment.examStatus })
  }

  if (roomId !== undefined) {
    const room = await Room.findOne({ _id: roomId, schoolId: req.user.schoolId })
    if (!room) return res.status(400).json({ error: 'roomId does not reference a room in this school' })
    assignment.roomId = room._id
  }
  if (examStatus !== undefined) assignment.examStatus = examStatus

  await assignment.save()
  res.json({ enrollmentId: assignment.enrollmentId, roomId: assignment.roomId, examStatus: assignment.examStatus })
}

module.exports = { split, getSplit, update }
