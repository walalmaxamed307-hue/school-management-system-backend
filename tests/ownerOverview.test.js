// /owner/overview — controller-ka oo dhan oo leh xog been abuur ah (models mock).
// Qiimaha la sugayo waa la xisaabiyay gacanta (eeg faallooyinka).

jest.mock('../models', () => ({
  School: { findById: jest.fn() }, Student: { find: jest.fn(), countDocuments: jest.fn() },
  Teacher: { countDocuments: jest.fn() }, TeacherAttendance: { aggregate: jest.fn() },
  Enrollment: { find: jest.fn() }, Class: { find: jest.fn() }, Section: { find: jest.fn() },
  Attendance: { aggregate: jest.fn() }, Fee: { find: jest.fn(), aggregate: jest.fn() },
  Exam: { find: jest.fn() }, StudentExamResult: { aggregate: jest.fn(), find: jest.fn() },
  AcademicYear: { findOne: jest.fn() }, SchoolSettings: { findOne: jest.fn() },
}))
jest.mock('../controllers/riskStudentsController', () => ({ computeRiskStudents: jest.fn() }))

const m = require('../models')
const { computeRiskStudents } = require('../controllers/riskStudentsController')
const { overview } = require('../controllers/ownerController')
const S = require('../utils/ownerStats')

const SCHOOL = '65f000000000000000000002'
const YEAR = '65f0000000000000000000aa'
const C1 = '65f0000000000000000000c1'
const C2 = '65f0000000000000000000c2'
const q = (v) => { const o = { select: () => o, sort: () => o, populate: () => o, lean: () => o, then: (a, b) => Promise.resolve(v).then(a, b) }; return o }
const now = new Date()
const thisMonth = S.lastMonthKeys(6, now)[5]
const today = S.localDateKey(now)

function setup({ attendanceAfterClass2 = false } = {}) {
  jest.clearAllMocks()
  m.School.findById.mockReturnValue(q({ name: 'AmirNur Secondary', phone: '61', address: 'Mogadishu' }))
  m.AcademicYear.findOne.mockReturnValue(q({ _id: YEAR, label: '2026-2027', passMarkSnapshot: 50 }))
  m.Class.find.mockReturnValue(q([{ _id: C1, name: 'Fasalka 1', level: 1 }, { _id: C2, name: 'Fasalka 2', level: 2 }]))
  m.Section.find.mockReturnValue(q([]))
  const st = (id, extra = {}) => ({ _id: id, feeCategory: 'paid', ...extra })
  m.Enrollment.find.mockReturnValue(q([
    { _id: 'e1', studentId: st('s1'), classId: C1 }, { _id: 'e2', studentId: st('s2'), classId: C1 },
    { _id: 'e3', studentId: st('s3'), classId: C1 }, { _id: 'e4', studentId: st('s4', { feeCategory: 'free' }), classId: C2 },
  ]))
  m.Student.countDocuments.mockResolvedValue(4)
  m.Teacher.countDocuments.mockResolvedValue(5)
  m.TeacherAttendance.aggregate.mockResolvedValue([{ _id: 'present', count: 3 }, { _id: 'absent', count: 1 }])
  m.Student.find.mockReturnValue(q([{ _id: 's4', fullName: 'Cusub Ardey', studentCode: 'STU-4', createdAt: now }]))
  m.Attendance.aggregate.mockImplementation(async (pipe) => {
    const id = pipe[1].$group._id
    if ('d' in id) { // trend (14 maalmood)
      return [
        { _id: { d: today, session: 'before_break', status: 'present' }, count: 3 },
        { _id: { d: today, session: 'before_break', status: 'absent' }, count: 1 },
        { _id: { d: today, session: 'after_break', status: 'present' }, count: 3 },
      ]
    }
    // maanta, class kasta
    return [
      { _id: { classId: C1, session: 'before_break', status: 'present' }, count: 2 },
      { _id: { classId: C1, session: 'before_break', status: 'absent' }, count: 1 },
      { _id: { classId: C2, session: 'before_break', status: 'present' }, count: 1 },
      { _id: { classId: C1, session: 'after_break', status: 'present' }, count: 3 },
      ...(attendanceAfterClass2 ? [{ _id: { classId: C2, session: 'after_break', status: 'present' }, count: 1 }] : []),
    ]
  })
  m.Fee.find.mockReturnValue(q([
    { enrollmentId: 'e1', amountDue: 10, amountPaid: 10 }, // paid
    { enrollmentId: 'e2', amountDue: 10, amountPaid: 4 },  // partial
  ]))                                                       // e3: doc ma jiro => unpaid (implicit 10); e4 free
  m.Fee.aggregate.mockImplementation(async (pipe) => {
    if (pipe[1].$group._id === '$month') return [{ _id: thisMonth, collected: 14 }, { _id: S.lastMonthKeys(6, now)[4], collected: 25 }]
    return [{ _id: null, count: 2, amount: 14 }]
  })
  m.SchoolSettings.findOne.mockReturnValue(q({ defaultStandardFeeAmount: 10 }))
  m.Exam.find.mockReturnValue(q([{ _id: 'x1', name: 'First Term', order: 0 }, { _id: 'x2', name: 'Mid Term', order: 1 }, { _id: 'x3', name: 'Final', order: 2 }]))
  m.StudentExamResult.aggregate.mockResolvedValue([{ _id: 'x1', n: 4 }, { _id: 'x2', n: 3 }]) // x3 weli lama daabacin
  m.StudentExamResult.find.mockReturnValue(q([
    { enrollmentId: 'e1', marks: { a: 40, b: 30 } }, // 70 gudbay
    { enrollmentId: 'e2', marks: { a: 20 } },        // 20 dhacay
    { enrollmentId: 'e4', marks: { a: 90 } },        // 90 gudbay (C2)
    { enrollmentId: 'e3', marks: {} },               // marks la'aan -> lama tirinayo
  ]))
  computeRiskStudents.mockResolvedValue({
    total: 2, highCount: 1, thresholds: { attendanceMinRatePercent: 75 },
    students: [
      { name: 'A', className: 'Fasalka 1', sectionName: '', level: 'high', parentPhone: '615', parentName: 'P', reasons: [{ type: 'fees', text: 'f' }, { type: 'attendance', text: 'a' }] },
      { name: 'B', className: 'Fasalka 2', sectionName: '', level: 'medium', parentPhone: '616', reasons: [{ type: 'results', text: 'r' }] },
    ],
  })
}
const run = async () => { const res = { json: jest.fn() }; await overview({ user: { schoolId: SCHOOL } }, res); return res.json.mock.calls[0][0] }

test('no active year -> friendly flag, no crash', async () => {
  setup()
  m.AcademicYear.findOne.mockReturnValue(q(null))
  expect(await run()).toMatchObject({ noActiveYear: true, school: { name: 'AmirNur Secondary' } })
})

test('totals, today attendance per session, pending classes', async () => {
  setup()
  const o = await run()
  expect(o.school.name).toBe('AmirNur Secondary')
  expect(o.totals).toEqual({ students: 4, teachers: 5, classes: 2 })
  // before: (2+1) present of (2+1+1+... ) => attended 3, marked 4 => 75%
  expect(o.attendanceToday.before).toMatchObject({ attended: 3, marked: 4, percent: 75 })
  // after: kaliya Fasalka 1 (3/3 = 100%) — Fasalka 2 weli lama calaamadin
  expect(o.attendanceToday.after).toMatchObject({ attended: 3, marked: 3, percent: 100 })
  expect(o.attendancePending.before).toEqual([])
  expect(o.attendancePending.after).toEqual([{ className: 'Fasalka 2', sectionName: '', students: 1 }])
  expect(o.attendancePending.totalGroups).toBe(2)
  const c1 = o.attendanceByClass.find((c) => c.className === 'Fasalka 1')
  expect(c1).toMatchObject({ students: 3 })
  expect(c1.before.percent).toBe(67) // 2/3
  const c2 = o.attendanceByClass.find((c) => c.className === 'Fasalka 2')
  expect(c2.after.percent).toBeNull()
})

test('after-break fully marked -> nothing pending', async () => {
  setup({ attendanceAfterClass2: true })
  expect((await run()).attendancePending.after).toEqual([])
})

test('attendance trend + teachers today + class distribution', async () => {
  setup()
  const o = await run()
  expect(o.attendanceTrend).toEqual([{ date: today, before: 75, after: 100 }])
  expect(o.teachersToday).toEqual({ total: 5, present: 3, late: 0, absent: 1, excused: 0, notMarked: 1 })
  expect(o.classDistribution).toEqual([
    { classId: C1, className: 'Fasalka 1', students: 3 }, { classId: C2, className: 'Fasalka 2', students: 1 },
  ])
})

test('new students today (with class) and 6-month series', async () => {
  setup()
  const o = await run()
  expect(o.newStudents.today).toBe(1)
  expect(o.newStudents.todayList).toEqual([{ name: 'Cusub Ardey', studentCode: 'STU-4', className: 'Fasalka 2', sectionName: '' }])
  expect(o.newStudents.byMonth).toHaveLength(6)
  expect(o.newStudents.byMonth[5]).toEqual({ month: thisMonth, count: 1 })
})

test('fees: expected excludes free students; status counts; outstanding; history', async () => {
  setup()
  const f = (await run()).fees
  // e1 due 10 + e2 due 10 + e3 implicit 10 = 30 (e4 free = 0). collected (bisha) = 14.
  expect(f).toMatchObject({ month: thisMonth, expected: 30, collected: 14, outstanding: 16, collectionRatePercent: 47 })
  expect(f.statusCounts).toEqual({ paid: 2, partial: 1, unpaid: 1 }) // e1+e4 paid, e2 partial, e3 unpaid
  expect(f.recordedToday).toEqual({ count: 2, amount: 14 })
  expect(f.history).toHaveLength(6)
  expect(f.history[5]).toEqual({ month: thisMonth, collected: 14 })
  expect(f.history[4].collected).toBe(25)
})

test('latest exam = highest-order PUBLISHED exam; pass stats ignore empty marks', async () => {
  setup()
  const e = (await run()).latestExam
  expect(e.name).toBe('Mid Term') // 'Final' weli lama daabacin
  expect(e).toMatchObject({ students: 3, passed: 2, failed: 1, passRatePercent: 67, passMark: 50 })
  expect(e.byClass.find((c) => c.className === 'Fasalka 1')).toMatchObject({ students: 2, passed: 1, passRatePercent: 50 })
  expect(m.StudentExamResult.find.mock.calls[0][0]).toMatchObject({ examId: 'x2', published: true })
})

test('no published exams -> latestExam null', async () => {
  setup()
  m.StudentExamResult.aggregate.mockResolvedValue([])
  expect((await run()).latestExam).toBeNull()
})

test('risk summary: counts by type, and NO parent contact details are exposed to the owner', async () => {
  setup()
  const r = (await run()).risk
  expect(r).toMatchObject({ total: 2, highCount: 1, byType: { attendance: 1, fees: 1, results: 1 } })
  expect(r.top).toHaveLength(2)
  expect(JSON.stringify(r)).not.toMatch(/parentPhone|parentName|615|616/)
})

test('every query is scoped to the token school', async () => {
  setup()
  await run()
  expect(m.Enrollment.find.mock.calls[0][0]).toMatchObject({ schoolId: SCHOOL, academicYearId: YEAR })
  expect(m.Student.countDocuments.mock.calls[0][0]).toMatchObject({ schoolId: SCHOOL })
  expect(String(m.Attendance.aggregate.mock.calls[0][0][0].$match.schoolId)).toBe(SCHOOL)
  expect(computeRiskStudents).toHaveBeenCalledWith(SCHOOL)
})
