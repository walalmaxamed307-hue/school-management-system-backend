const { Announcement, User, Teacher } = require('../models')

async function resolveAuthorName(schoolId, authorUserId, authorRoleSnapshot) {
  if (authorRoleSnapshot === 'admin') {
    const user = await User.findById(authorUserId)
    return user?.name ?? 'Admin'
  }
  const teacher = await Teacher.findOne({ userId: authorUserId, schoolId })
  return teacher?.fullName ?? 'Teacher'
}

// Ardaydu (student token) sidoo kale way arki karaan ogeysiisyada
// iskuulkooda — kaliya admin/macalin ayaa qori/tirtiri kara (create/remove).
async function list(req, res) {
  const schoolId = req.user?.schoolId ?? req.student?.schoolId
  const announcements = await Announcement.find({ schoolId })
    .sort({ createdAt: -1 })
    .lean()

  res.json(
    await Promise.all(
      announcements.map(async (a) => ({
        id: a._id,
        title: a.title,
        body: a.body,
        eventDate: a.eventDate,
        authorRole: a.authorRoleSnapshot,
        author: await resolveAuthorName(schoolId, a.authorUserId, a.authorRoleSnapshot),
        createdAt: a.createdAt,
      }))
    )
  )
}

async function create(req, res) {
  const { title, body, eventDate } = req.body
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' })

  const announcement = await Announcement.create({
    schoolId: req.user.schoolId,
    title,
    body,
    eventDate: eventDate || null,
    authorUserId: req.user.userId,
    authorRoleSnapshot: req.user.role,
  })
  res.status(201).json(announcement)
}

async function remove(req, res) {
  const announcement = await Announcement.findOneAndDelete({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!announcement) return res.status(404).json({ error: 'Announcement not found' })
  res.status(204).end()
}

module.exports = { list, create, remove }
