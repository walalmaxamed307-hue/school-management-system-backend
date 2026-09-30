const { Room, RoomAssignment } = require('../models')

async function list(req, res) {
  const rooms = await Room.find({ schoolId: req.user.schoolId }).sort({ name: 1 })
  res.json(rooms)
}

async function create(req, res) {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  const room = await Room.create({ schoolId: req.user.schoolId, name })
  res.status(201).json(room)
}

async function update(req, res) {
  const { name, isActive } = req.body
  const updates = {}
  if (name !== undefined) updates.name = name
  if (isActive !== undefined) updates.isActive = isActive

  const room = await Room.findOneAndUpdate(
    { _id: req.params.id, schoolId: req.user.schoolId },
    updates,
    { new: true, runValidators: true }
  )
  if (!room) return res.status(404).json({ error: 'Room not found' })
  res.json(room)
}

async function remove(req, res) {
  const inUse = await RoomAssignment.exists({ schoolId: req.user.schoolId, roomId: req.params.id })
  if (inUse) {
    return res.status(409).json({ error: 'Cannot delete a room that has exam-room assignments referencing it' })
  }
  const room = await Room.findOneAndDelete({ _id: req.params.id, schoolId: req.user.schoolId })
  if (!room) return res.status(404).json({ error: 'Room not found' })
  res.status(204).end()
}

module.exports = { list, create, update, remove }
