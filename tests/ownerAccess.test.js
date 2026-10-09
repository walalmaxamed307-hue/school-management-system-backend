// Owner: ilaalinta (deny-by-default), /owner/overview auth, iyo maamulka akoonnada.
process.env.JWT_SECRET = 'test-secret-test-secret-123'

jest.mock('../models', () => ({
  User: { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), updateOne: jest.fn(), deleteOne: jest.fn() },
  School: { findById: jest.fn() },
}))
jest.mock('../controllers/ownerController', () => ({
  overview: (req, res) => res.json({ ok: true, schoolId: req.user.schoolId }),
}))

const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { User, School } = require('../models')

const SCHOOL = '65f000000000000000000002'
const tok = (over = {}) => jwt.sign({ userId: '65f000000000000000000001', schoolId: SCHOOL, role: 'owner', ...over }, process.env.JWT_SECRET)
const q = (value) => ({ select: () => q(value), sort: () => q(value), lean: () => q(value), then: (a, b) => Promise.resolve(value).then(a, b) })

let server, base
beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/auth', require('../routes/auth'))
  app.use('/dashboard', require('../routes/dashboard'))
  app.use('/owner', require('../routes/owner'))
  app.use('/owner-accounts', require('../routes/ownerAccounts'))
  app.use((err, req, res, next) => res.status(err.code === 11000 ? 409 : 500).json({ error: err.message }))
  await new Promise((r) => { server = app.listen(0, r) })
  base = `http://127.0.0.1:${server.address().port}`
})
afterAll(() => new Promise((r) => server.close(r)))
beforeEach(() => {
  jest.clearAllMocks()
  User.findOne.mockResolvedValue({ _id: 'u1', schoolId: SCHOOL, role: 'owner', isActive: true })
  School.findById.mockReturnValue(q({ isActive: true }))
})
const call = (method, path, token, body) =>
  fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })

describe('owner is blocked from every pre-existing staff route (deny-by-default)', () => {
  test('GET /dashboard/stats (an "any staff" route) -> 403 for owner', async () => {
    const res = await call('GET', '/dashboard/stats', tok())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/Owner accounts/)
  })
  test('admin-management routes -> 403 for owner', async () => {
    expect((await call('GET', '/owner-accounts', tok())).status).toBe(403)
    expect((await call('POST', '/owner-accounts', tok(), { email: 'a@b.co', password: 'password123' })).status).toBe(403)
  })
})

describe('GET /owner/overview auth', () => {
  test('no token 401; garbage 401', async () => {
    expect((await call('GET', '/owner/overview')).status).toBe(401)
    expect((await call('GET', '/owner/overview', 'garbage')).status).toBe(401)
  })
  test('admin / teacher / student / platform tokens -> 403', async () => {
    expect((await call('GET', '/owner/overview', tok({ role: 'admin' }))).status).toBe(403)
    expect((await call('GET', '/owner/overview', tok({ role: 'teacher' }))).status).toBe(403)
    const student = jwt.sign({ studentId: 's', schoolId: SCHOOL, scope: 'student' }, process.env.JWT_SECRET)
    expect((await call('GET', '/owner/overview', student)).status).toBe(403)
    const platform = jwt.sign({ platformAdminId: 'p', scope: 'platform' }, process.env.JWT_SECRET)
    expect((await call('GET', '/owner/overview', platform)).status).toBe(403)
  })
  test('valid active owner -> 200 and DB is checked', async () => {
    const res = await call('GET', '/owner/overview', tok())
    expect(res.status).toBe(200)
    expect((await res.json()).schoolId).toBe(SCHOOL)
    expect(User.findOne.mock.calls[0][0]).toMatchObject({ role: 'owner', isActive: true, schoolId: SCHOOL })
  })
  test('deactivated/deleted owner is cut off IMMEDIATELY (valid JWT, DB says no) -> 401', async () => {
    User.findOne.mockResolvedValue(null)
    expect((await call('GET', '/owner/overview', tok())).status).toBe(401)
  })
  test('disabled school -> 403', async () => {
    School.findById.mockReturnValue(q({ isActive: false }))
    expect((await call('GET', '/owner/overview', tok())).status).toBe(403)
  })
})

describe('owner can change their own password', () => {
  test('success path', async () => {
    User.findOne.mockResolvedValue({ _id: 'u1', schoolId: SCHOOL, passwordHash: await bcrypt.hash('oldpassword1', 4) })
    User.updateOne.mockResolvedValue({})
    const res = await call('POST', '/auth/change-password', tok({ userId: 'owner-cp-user' }), { currentPassword: 'oldpassword1', newPassword: 'newpassword1' })
    expect(res.status).toBe(200)
    expect(User.updateOne).toHaveBeenCalled()
  })
})

describe('admin: /owner-accounts', () => {
  const admin = () => tok({ role: 'admin' })

  test('create: validates email + password', async () => {
    expect((await call('POST', '/owner-accounts', admin(), { email: 'not-an-email', password: 'password123' })).status).toBe(400)
    expect((await call('POST', '/owner-accounts', admin(), { email: 'a@b.co', password: 'short' })).status).toBe(400)
    expect((await call('POST', '/owner-accounts', admin(), { email: 'a@b.co', password: 'a'.repeat(73) })).status).toBe(400)
    expect((await call('POST', '/owner-accounts', admin(), { email: 'a@b.co' })).status).toBe(400)
    expect(User.create).not.toHaveBeenCalled()
  })
  test('create: stores role owner, school from token (NOT body), hashed password; response has no hash', async () => {
    User.create.mockImplementation(async (d) => ({ _id: 'new1', isActive: true, createdAt: new Date(), ...d }))
    const res = await call('POST', '/owner-accounts', admin(), { email: ' Boss@School.so ', password: 'password123', role: 'admin', schoolId: 'evil' })
    expect(res.status).toBe(201)
    const arg = User.create.mock.calls[0][0]
    expect(arg).toMatchObject({ schoolId: SCHOOL, role: 'owner', email: 'Boss@School.so' })
    expect(arg.passwordHash).not.toBe('password123')
    expect(await bcrypt.compare('password123', arg.passwordHash)).toBe(true)
    expect(JSON.stringify(await res.json())).not.toMatch(/passwordHash|\$2[aby]\$/)
  })
  test('duplicate email -> 409 (via error handler)', async () => {
    User.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }))
    expect((await call('POST', '/owner-accounts', admin(), { email: 'a@b.co', password: 'password123' })).status).toBe(409)
  })
  test('list is scoped to school + role owner', async () => {
    User.find.mockReturnValue(q([{ _id: 'o1', email: 'x@y.co', isActive: true, createdAt: new Date() }]))
    const res = await call('GET', '/owner-accounts', admin())
    expect(res.status).toBe(200)
    expect(User.find).toHaveBeenCalledWith({ schoolId: SCHOOL, role: 'owner' })
    expect(await res.json()).toHaveLength(1)
  })
  test('patch: reset password + deactivate; 404 for a non-owner/foreign id; rejects empty body', async () => {
    User.findOne.mockResolvedValue({ _id: 'o1', schoolId: SCHOOL, email: 'x@y.co', toObject() { return { _id: 'o1', email: 'x@y.co', isActive: true } } })
    User.updateOne.mockResolvedValue({})
    expect((await call('PATCH', '/owner-accounts/o1', admin(), { password: 'brandnewpass1', isActive: false })).status).toBe(200)
    expect(User.findOne).toHaveBeenCalledWith({ _id: 'o1', schoolId: SCHOOL, role: 'owner' })
    const set = User.updateOne.mock.calls[0][1]
    expect(set.isActive).toBe(false)
    expect(await bcrypt.compare('brandnewpass1', set.passwordHash)).toBe(true)
    expect((await call('PATCH', '/owner-accounts/o1', admin(), {})).status).toBe(400)
    expect((await call('PATCH', '/owner-accounts/o1', admin(), { password: 'x' })).status).toBe(400)
    User.findOne.mockResolvedValue(null)
    expect((await call('PATCH', '/owner-accounts/zzz', admin(), { isActive: true })).status).toBe(404)
  })
  test('delete is scoped to school + role owner; 404 when nothing deleted', async () => {
    User.deleteOne.mockResolvedValue({ deletedCount: 1 })
    expect((await call('DELETE', '/owner-accounts/o1', admin())).status).toBe(200)
    expect(User.deleteOne).toHaveBeenCalledWith({ _id: 'o1', schoolId: SCHOOL, role: 'owner' })
    User.deleteOne.mockResolvedValue({ deletedCount: 0 })
    expect((await call('DELETE', '/owner-accounts/o1', admin())).status).toBe(404)
  })
})
