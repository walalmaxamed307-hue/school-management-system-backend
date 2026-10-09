const S = require('../utils/ownerStats')

describe('sessionSummary / pct', () => {
  test('late counts as attended, excused is NOT attended (but is in total)', () => {
    expect(S.sessionSummary({ present: 6, late: 2, absent: 1, excused: 1 })).toMatchObject({ attended: 8, marked: 10, percent: 80 })
  })
  test('nothing marked -> percent null (never 0%)', () => {
    expect(S.sessionSummary({}).percent).toBeNull()
    expect(S.pct(0, 0)).toBeNull()
  })
  test('2 of 10 = 20%', () => expect(S.sessionSummary({ present: 2, absent: 8 }).percent).toBe(20))
})

describe('date helpers', () => {
  const now = new Date(2026, 9, 9, 15, 30) // 9 Oct 2026 (local)
  test('lastDayKeys: oldest first, ends today', () => {
    const k = S.lastDayKeys(3, now)
    expect(k).toEqual(['2026-10-07', '2026-10-08', '2026-10-09'])
  })
  test('lastMonthKeys crosses the year boundary', () => {
    expect(S.lastMonthKeys(4, new Date(Date.UTC(2026, 1, 10)))).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('buildAttendanceTrend', () => {
  const days = ['2026-10-05', '2026-10-06', '2026-10-07']
  test('only days with data; sessions independent; ignores days outside the window', () => {
    const rows = [
      { date: '2026-10-05', session: 'before_break', status: 'present', count: 9 },
      { date: '2026-10-05', session: 'before_break', status: 'absent', count: 1 },
      { date: '2026-10-07', session: 'after_break', status: 'present', count: 5 },
      { date: '2026-10-07', session: 'after_break', status: 'absent', count: 5 },
      { date: '2020-01-01', session: 'before_break', status: 'present', count: 99 },
    ]
    expect(S.buildAttendanceTrend(rows, days)).toEqual([
      { date: '2026-10-05', before: 90, after: null },
      { date: '2026-10-07', before: null, after: 50 },
    ])
  })
})

describe('passStats', () => {
  test('total >= passMark passes; empty marks ignored; per class', () => {
    const r = S.passStats([
      { classId: 'a', total: 50, hasMarks: true }, { classId: 'a', total: 49, hasMarks: true },
      { classId: 'b', total: 80, hasMarks: true }, { classId: 'b', total: 0, hasMarks: false },
    ], 50)
    expect(r).toMatchObject({ students: 3, passed: 2, failed: 1, passRatePercent: 67, averageTotal: 59.7 })
    expect(r.byClass.find((c) => c.classId === 'a')).toMatchObject({ students: 2, passed: 1, passRatePercent: 50 })
  })
  test('no results -> nulls', () => {
    expect(S.passStats([], 50)).toMatchObject({ students: 0, passRatePercent: null, averageTotal: null })
  })
})

test('riskBreakdown counts students per reason type once', () => {
  expect(S.riskBreakdown([
    { reasons: [{ type: 'fees' }, { type: 'fees' }, { type: 'results' }] },
    { reasons: [{ type: 'attendance' }] },
  ])).toEqual({ attendance: 1, fees: 1, results: 1 })
})
