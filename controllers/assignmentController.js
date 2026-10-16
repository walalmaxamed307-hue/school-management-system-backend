const mongoose = require('mongoose')
const { Assignment, AssignmentView, AcademicYear, Class, Section, Subject, TeacherAssignment, Enrollment, Teacher } = require('../models')
const storage = require('../services/storage')
const { inspectFile, displayName, ASSIGNMENT_TYPES } = require('../services/fileRules')

const validId = (value) => typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)
const activeYear = (schoolId) => AcademicYear.findOne({ schoolId, status: 'active' }).select('_id').lean()
const named = (query) => query.populate('classId', 'name').populate('sectionId', 'name').populate('subjectId', 'name')
function dto(item, extra = {}) { return { id: item._id, title: item.title, description: item.description || '', kind: item.kind, dueDate: item.dueDate?.toISOString().slice(0, 10) || null, classId: item.classId?._id || item.classId, className: item.classId?.name || null, sectionId: item.sectionId?._id || item.sectionId || null, sectionName: item.sectionId?.name || null, subjectId: item.subjectId?._id || item.subjectId, subjectName: item.subjectId?.name || null, fileName: item.file?.originalName || null, fileSize: item.file?.size || null, uploadedBy: item.uploadedByName, createdAt: item.createdAt, ...extra } }

async function teacherCanPost(req, yearId, classId, sectionId, subjectId) {
  if (!req.user.teacherId) return false
  const rows = await TeacherAssignment.find({ schoolId: req.user.schoolId, academicYearId: yearId, teacherId: req.user.teacherId, classId, subjectId }).select('sectionId').lean()
  return rows.some((row) => !row.sectionId || (sectionId && String(row.sectionId) === String(sectionId)))
}

async function validateInput(req, yearId) {
  const body = req.body || {}
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const sectionId = body.sectionId || null
  if (!title || title.length > 150 || description.length > 2000 || !['lesson', 'questions', 'other'].includes(body.kind || 'lesson') || !validId(body.classId) || !validId(body.subjectId) || (sectionId && !validId(sectionId))) return { error: 'Xogta assignment-ka ma sax aha' }
  const [klass, subject, section] = await Promise.all([Class.findOne({ _id: body.classId, schoolId: req.user.schoolId }), Subject.findOne({ _id: body.subjectId, schoolId: req.user.schoolId }), sectionId ? Section.findOne({ _id: sectionId, classId: body.classId, schoolId: req.user.schoolId }) : null])
  if (!klass || !subject || (sectionId && !section)) return { error: 'Class, subject ama section lama helin', status: 404 }
  if (req.user.role === 'teacher' && !(await teacherCanPost(req, yearId, body.classId, sectionId, body.subjectId))) return { error: 'Fasalkan/maadadan laguma qoondeyn', status: 403 }
  return { data: { title, description, sectionId, classId: body.classId, subjectId: body.subjectId, kind: body.kind || 'lesson', dueDate: body.dueDate || null } }
}

async function uploadedFile(req, assignmentId) {
  if (!req.file) return null
  storage.requireConfigured()
  const { ext, mime } = inspectFile(req.file, ASSIGNMENT_TYPES)
  const key = storage.assignmentKey(req.user.schoolId, assignmentId, ext)
  await storage.putObject({ key, body: req.file.buffer, contentType: mime })
  return { key, originalName: displayName(req.file.originalname), mimeType: mime, size: req.file.size }
}

async function list(req, res) {
  const year = await activeYear(req.user.schoolId)
  if (!year) return res.json({ items: [] })
  const filter = { schoolId: req.user.schoolId, academicYearId: year._id }
  for (const key of ['classId', 'sectionId', 'subjectId']) if (req.query[key]) { if (!validId(req.query[key])) return res.status(400).json({ error: `Invalid ${key}` }); filter[key] = req.query[key] }
  if (req.user.role === 'teacher') filter.uploadedByUserId = req.user.userId
  const items = await named(Assignment.find(filter).sort({ createdAt: -1 }).limit(200)).lean()
  const ids = items.map((item) => item._id)
  const views = ids.length
    ? await AssignmentView.aggregate([
      { $match: { schoolId: new mongoose.Types.ObjectId(req.user.schoolId), assignmentId: { $in: ids } } },
      { $group: { _id: '$assignmentId', count: { $sum: 1 } } },
    ])
    : []
  const seenCounts = new Map(views.map((view) => [String(view._id), view.count]))
  res.json({ items: items.map((item) => dto(item, { canDelete: req.user.role === 'admin' || String(item.uploadedByUserId) === String(req.user.userId), seenCount: seenCounts.get(String(item._id)) || 0 })) })
}

async function create(req, res) {
  const year = await activeYear(req.user.schoolId)
  if (!year) return res.status(400).json({ error: 'Sanad dugsiyeed firfircoon ma jiro' })
  const checked = await validateInput(req, year._id)
  if (checked.error) return res.status(checked.status || 400).json({ error: checked.error })
  const _id = new mongoose.Types.ObjectId()
  let file
  try {
    file = await uploadedFile(req, _id)
    let uploadedByName = req.user.role === 'admin' ? 'Admin' : 'Macallin'
    if (req.user.teacherId) { const teacher = await Teacher.findOne({ _id: req.user.teacherId, schoolId: req.user.schoolId }).select('fullName').lean(); if (teacher?.fullName) uploadedByName = teacher.fullName }
    const doc = await Assignment.create({ _id, schoolId: req.user.schoolId, academicYearId: year._id, ...checked.data, ...(file ? { file } : {}), uploadedByUserId: req.user.userId, uploadedByName })
    res.status(201).json(dto(await named(Assignment.findById(doc._id)).lean(), { canDelete: true }))
  } catch (err) { if (file) await storage.deleteObject(file.key); throw err }
}

async function staff(req) {
  if (!validId(req.params.id)) return null
  const item = await Assignment.findOne({ _id: req.params.id, schoolId: req.user.schoolId }).lean()
  return item && (req.user.role === 'admin' || String(item.uploadedByUserId) === String(req.user.userId)) ? item : null
}

async function update(req, res) {
  const existing = await staff(req)
  if (!existing) return res.status(404).json({ error: 'Assignment lama helin' })
  const year = await activeYear(req.user.schoolId)
  if (!year || String(existing.academicYearId) !== String(year._id)) return res.status(400).json({ error: 'Post-kan wuxuu ka tirsan yahay sanad hore' })
  const checked = await validateInput(req, year._id)
  if (checked.error) return res.status(checked.status || 400).json({ error: checked.error })
  let replacement
  try {
    replacement = await uploadedFile(req, existing._id)
    const doc = await Assignment.findOneAndUpdate({ _id: existing._id, schoolId: req.user.schoolId }, { ...checked.data, ...(replacement ? { file: replacement } : {}) }, { new: true, runValidators: true })
    if (!doc) throw new Error('Assignment lama helin')
    if (replacement) await storage.deleteObject(existing.file?.key)
    res.json(dto(await named(Assignment.findById(doc._id)).lean(), { canDelete: true }))
  } catch (err) { if (replacement) await storage.deleteObject(replacement.key); throw err }
}

async function download(req, res) { const item = await staff(req); if (!item || !item.file?.key) return res.status(404).json({ error: 'File lama helin' }); res.json({ url: await storage.signedUrl(item.file.key, { filename: item.file.originalName }), name: item.file.originalName }) }
async function remove(req, res) { const item = await staff(req); if (!item) return res.status(404).json({ error: 'Assignment lama helin' }); await Assignment.deleteOne({ _id: item._id, schoolId: req.user.schoolId }); await storage.deleteObject(item.file?.key); res.status(204).end() }
async function mineFilter(req) { const year = await activeYear(req.student.schoolId); if (!year) return null; const enrollment = await Enrollment.findOne({ schoolId: req.student.schoolId, academicYearId: year._id, studentId: req.student.studentId, status: 'active' }).select('classId sectionId').lean(); return enrollment && { schoolId: req.student.schoolId, academicYearId: year._id, classId: enrollment.classId, $or: [{ sectionId: null }, { sectionId: enrollment.sectionId || null }] } }
async function listMine(req, res) {
  const filter = await mineFilter(req)
  if (!filter) return res.json([])
  const items = await named(Assignment.find(filter).sort({ createdAt: -1 }).limit(200)).lean()
  // GET-ga ardayga wuxuu ka dhigan yahay in posts-kan loo tusay. upsert-ka
  // unique index ayaa hubinaya in ardayga aan laba jeer lagu tirin.
  if (items.length) {
    await AssignmentView.bulkWrite(items.map((item) => ({
      updateOne: {
        filter: { assignmentId: item._id, studentId: req.student.studentId },
        update: { $setOnInsert: { schoolId: req.student.schoolId, assignmentId: item._id, studentId: req.student.studentId } },
        upsert: true,
      },
    })), { ordered: false })
  }
  res.json(items.map(dto))
}
async function downloadMine(req, res) { const filter = await mineFilter(req); const item = filter && validId(req.params.id) && await Assignment.findOne({ ...filter, _id: req.params.id }).lean(); if (!item || !item.file?.key) return res.status(404).json({ error: 'File lama helin' }); res.json({ url: await storage.signedUrl(item.file.key, { filename: item.file.originalName }), name: item.file.originalName }) }
async function viewers(req, res) {
  const item = await staff(req)
  if (!item) return res.status(404).json({ error: 'Assignment lama helin' })
  const viewers = await AssignmentView.find({ schoolId: req.user.schoolId, assignmentId: item._id })
    .populate('studentId', 'fullName studentCode')
    .sort({ createdAt: -1 })
    .lean()
  res.json({
    count: viewers.length,
    viewers: viewers.filter((view) => view.studentId).map((view) => ({
      id: view.studentId._id,
      name: view.studentId.fullName,
      studentCode: view.studentId.studentCode,
      seenAt: view.createdAt,
    })),
  })
}

module.exports = { list, create, update, download, remove, listMine, downloadMine, viewers }
