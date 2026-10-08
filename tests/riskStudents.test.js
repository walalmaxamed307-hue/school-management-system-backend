// Tests: xeerarka khatarta (pure) + controller-ka oo dhan (models mock-gareeyay,
// xog been abuur ah). DB ma u baahna.

const { attendanceSignal, feeSignal, resultSignal, riskLevel, RISK_CONFIG } = require('../utils/riskScoring')

describe('attendanceSignal', () => {
  test('flags below 75% with enough sessions', () => {
    const s = attendanceSignal({ present: 6, late: 0, absent: 4 }) // 60%
    expect(s.flag).toBe(true)
    expect(s.rate).toBeCloseTo(0.6)
  })
  test('does not flag at/above 75%', () => {
    expect(attendanceSignal({ present: 7, late: 1, absent: 2 }).flag).toBe(false) // 80%
    expect(attendanceSignal({ present: 15, late: 0, absent: 5 }).flag).toBe(false) // exactly 75%
  })
  test('too little data -> never flagged', () => {
    expect(attendanceSignal({ present: 0, late: 0, absent: 5 }).flag).toBe(false) // 5 < 6
  })
  test('late counts as attended; excused is ignored by the caller', () => {
    expect(attendanceSignal({ present: 0, late: 8, absent: 0 }).rate).toBe(1)
  })
})

describe('feeSignal', () => {
  const months = ['2026-08', '2026-09']
  const paidStudent = { feeCategory: 'paid' }
  const doc = (status, due = 10, paid = 0) => ({ status, amountDue: due, amountPaid: paid })

  test('2 unpaid billing months -> flagged, owed amount summed', () => {
    const s = feeSignal({
      student: paidStudent, enrolledMonth: '2026-01', billingMonths: months,
      feeDocsByMonth: { '2026-08': doc('unpaid'), '2026-09': doc('partial', 10, 4) }, standardAmount: 10,
    })
    expect(s).toMatchObject({ flag: true, owingMonths: 2, owedAmount: 16 })
  })
  test('missing doc counts as unpaid (standard amount)', () => {
    const s = feeSignal({ student: paidStudent, enrolledMonth: '2026-01', billingMonths: months, feeDocsByMonth: {}, standardAmount: 10 })
    expect(s).toMatchObject({ flag: true, owingMonths: 2, owedAmount: 20 })
  })
  test('1 unpaid month is NOT enough', () => {
    const s = feeSignal({
      student: paidStudent, enrolledMonth: '2026-01', billingMonths: months,
      feeDocsByMonth: { '2026-08': doc('paid', 10, 10) }, standardAmount: 10,
    })
    expect(s.flag).toBe(false)
  })
  test('free students are never flagged', () => {
    const s = feeSignal({ student: { feeCategory: 'free' }, enrolledMonth: '2026-01', billingMonths: months, feeDocsByMonth: {}, standardAmount: 10 })
    expect(s.flag).toBe(false)
  })
  test('standard fee not configured (0) -> missing docs are not guessed as owed', () => {
    const s = feeSignal({ student: paidStudent, enrolledMonth: '2026-01', billingMonths: months, feeDocsByMonth: {}, standardAmount: 0 })
    expect(s.flag).toBe(false)
  })
  test('months before the student enrolled are ignored', () => {
    const s = feeSignal({ student: paidStudent, enrolledMonth: '2026-09', billingMonths: months, feeDocsByMonth: {}, standardAmount: 10 })
    expect(s).toMatchObject({ flag: false, owingMonths: 1 })
  })
  test('discount student uses discounted implicit amount; fully-discounted owes nothing', () => {
    const d = feeSignal({ student: { feeCategory: 'discount', discountAmount: 4 }, enrolledMonth: '2026-01', billingMonths: months, feeDocsByMonth: {}, standardAmount: 10 })
    expect(d.owedAmount).toBe(12)
    const z = feeSignal({ student: { feeCategory: 'discount', discountAmount: 10 }, enrolledMonth: '2026-01', billingMonths: months, feeDocsByMonth: {}, standardAmount: 10 })
    expect(z.flag).toBe(false)
  })
})

describe('resultSignal + riskLevel', () => {
  test('2 failed published exams -> flagged', () => {
    const s = resultSignal({ passMark: 50, results: [
      { examId: 'a', total: 40, hasMarks: true }, { examId: 'b', total: 49, hasMarks: true }, { examId: 'c', total: 90, hasMarks: true },
    ] })
    expect(s.flag).toBe(true)
    expect(s.failedExamIds).toEqual(['a', 'b'])
  })
  test('exactly passMark passes (same rule as promotion/UI: total >= passMark)', () => {
    expect(resultSignal({ passMark: 50, results: [{ examId: 'a', total: 50, hasMarks: true }, { examId: 'b', total: 50, hasMarks: true }] }).flag).toBe(false)
  })
  test('empty marks are not counted as failures', () => {
    expect(resultSignal({ passMark: 50, results: [{ examId: 'a', total: 0, hasMarks: false }, { examId: 'b', total: 0, hasMarks: false }] }).flag).toBe(false)
  })
  test('riskLevel', () => {
    expect([riskLevel(0), riskLevel(1), riskLevel(2), riskLevel(3)]).toEqual([null, 'medium', 'high', 'high'])
  })
})

// ---------------------------------------------------------------------------
// Controller — models-ka waa la mock-gareeyay; query chains (populate/select/lean)
// waxay soo celiyaan xog go'an.
// ---------------------------------------------------------------------------
jest.mock('../models', () => ({
  Enrollment: { find: jest.fn() }, Attendance: { aggregate: jest.fn() }, Fee: { find: jest.fn() },
  Exam: { find: jest.fn() }, StudentExamResult: { find: jest.fn() },
  AcademicYear: { findOne: jest.fn() }, SchoolSettings: { findOne: jest.fn() },
}))
const models = require('../models')
const { riskStudents } = require('../controllers/riskStudentsController')

const chain = (value) => {
  const q = { populate: () => q, select: () => q, lean: () => q, then: (res, rej) => Promise.resolve(value).then(res, rej) }
  return q
}
const SCHOOL = '65f000000000000000000002'
const YEAR = '65f0000000000000000000aa'
const id = (n) => `65f0000000000000000001${String(n).padStart(2, '0')}`
const mkEnrollment = (n, name, extra = {}) => ({
  _id: id(n), enrolledAt: new Date('2026-01-01'),
  classId: { name: 'Fasalka 5' }, sectionId: { name: 'A' },
  studentId: { _id: id(n + 50), fullName: name, studentCode: `STU-${n}`, feeCategory: 'paid', lifecycleStatus: 'active', parentName: 'P', parentPhone: '61' + n, ...extra },
})

function run() {
  const res = { json: jest.fn() }
  return riskStudents({ user: { schoolId: SCHOOL } }, res).then(() => res.json.mock.calls[0][0])
}

describe('riskStudents controller', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    models.AcademicYear.findOne.mockResolvedValue({ _id: YEAR, label: '2025-2026', passMarkSnapshot: 50 })
    models.SchoolSettings.findOne.mockReturnValue(chain({ defaultStandardFeeAmount: 10 }))
  })

  test('no active year -> empty result', async () => {
    models.AcademicYear.findOne.mockResolvedValue(null)
    expect(await run()).toMatchObject({ total: 0, students: [], academicYear: null })
  })

  test('combines attendance + fees + results; sorts high before medium; healthy students excluded', async () => {
    const [a, b, c, d] = [1, 2, 3, 4]
    models.Enrollment.find.mockReturnValue(chain([
      mkEnrollment(a, 'Axmed Hoose'),   // attendance + fees + results => high
      mkEnrollment(b, 'Bashiir Lacag'), // fees only => medium
      mkEnrollment(c, 'Cali Fiican'),   // healthy
      mkEnrollment(d, 'Dahir Free', { feeCategory: 'free' }), // free, nothing else => excluded
    ]))
    models.Attendance.aggregate.mockResolvedValue([
      { _id: { enrollmentId: id(a), status: 'present' }, count: 5 }, { _id: { enrollmentId: id(a), status: 'absent' }, count: 5 },
      { _id: { enrollmentId: id(c), status: 'present' }, count: 10 },
    ])
    const fee = (n, month, status) => ({ enrollmentId: id(n), month, status, amountDue: 10, amountPaid: status === 'paid' ? 10 : 0 })
    models.Fee.find.mockReturnValue(chain([
      fee(a, '2026-07', 'unpaid'), fee(a, '2026-08', 'unpaid'),
      fee(b, '2026-07', 'unpaid'), fee(b, '2026-08', 'unpaid'),
      fee(c, '2026-07', 'paid'), fee(c, '2026-08', 'paid'),
      fee(d, '2026-07', 'paid'), fee(d, '2026-08', 'paid'),
    ]))
    models.Exam.find.mockReturnValue(chain([{ _id: 'e1', name: 'First Term' }, { _id: 'e2', name: 'Mid Term' }]))
    models.StudentExamResult.find.mockReturnValue(chain([
      { enrollmentId: id(a), examId: 'e1', marks: { m1: 20, m2: 10 } }, { enrollmentId: id(a), examId: 'e2', marks: { m1: 30 } },
      { enrollmentId: id(c), examId: 'e1', marks: { m1: 80 } },
    ]))

    const out = await run()
    expect(out.total).toBe(2)
    expect(out.highCount).toBe(1)
    expect(out.students.map((s) => s.name)).toEqual(['Axmed Hoose', 'Bashiir Lacag'])
    expect(out.students[0].level).toBe('high')
    expect(out.students[0].reasons.map((r) => r.type).sort()).toEqual(['attendance', 'fees', 'results'])
    expect(out.students[0].reasons.find((r) => r.type === 'results').text).toMatch(/First Term, Mid Term/)
    expect(out.students[1]).toMatchObject({ level: 'medium', className: 'Fasalka 5', sectionName: 'A' })
    // sharaxaad: tirada bilaha ee Fee waxay ka timid 2 billing months (07, 08); bisha hadda lama tirin
    expect(out.students[1].reasons[0]).toMatchObject({ type: 'fees', owingMonths: 2 })
  })

  test('only active-lifecycle students are listed', async () => {
    models.Enrollment.find.mockReturnValue(chain([mkEnrollment(1, 'Graduated Guy', { lifecycleStatus: 'graduated' })]))
    models.Attendance.aggregate.mockResolvedValue([{ _id: { enrollmentId: id(1), status: 'absent' }, count: 20 }])
    models.Fee.find.mockReturnValue(chain([]))
    models.Exam.find.mockReturnValue(chain([]))
    models.StudentExamResult.find.mockReturnValue(chain([]))
    expect((await run()).total).toBe(0)
  })
})
