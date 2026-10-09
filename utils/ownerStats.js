// Xisaabaadka dashboard-ka milkiilaha (owner) — PURE functions (DB ma u baahna),
// si fudud loo test-gareeyo. ownerController ayaa xogta ka soo qaada DB oo
// halkan u gudbiya.

const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : null)

// Session kasta: joogo = present + late; tirada guud = dhammaan la
// calaamadiyay (oo ay ku jiraan absent iyo excused) — isla xeerka admin dashboard-ka.
function sessionSummary({ present = 0, late = 0, absent = 0, excused = 0 } = {}) {
  const attended = present + late
  const marked = attended + absent + excused
  return { present, late, absent, excused, attended, marked, percent: pct(attended, marked) }
}

// Taariikhda maxalliga ah 'YYYY-MM-DD' (isla "maanta" ee server-ka).
function localDateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 'YYYY-MM' — isla qaabka Fee.month (UTC), si bilaha Fee-ga u waafaqaan.
const monthKey = (d) => d.toISOString().slice(0, 7)

// n bilood oo ugu dambeeyay, kan hore ilaa kan hadda (oo ay ku jirto).
function lastMonthKeys(n, now = new Date()) {
  const keys = []
  for (let i = n - 1; i >= 0; i--) {
    keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))))
  }
  return keys
}

// n maalmood ee ugu dambeeyay (oo ay ku jirto maanta), kan hore ilaa maanta.
function lastDayKeys(n, now = new Date()) {
  const keys = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    keys.push(localDateKey(d))
  }
  return keys
}

// rows: [{ date:'YYYY-MM-DD', session, status, count }]. Waxay soo celisaa
// KALIYA maalmaha xog leh (fasaxyada/maalmaha aan la qaadin lama muujiyo
// sidii 0%, haddii kale garaafku wuu ku burbur lahaa).
function buildAttendanceTrend(rows, dayKeys) {
  const byDay = new Map(dayKeys.map((k) => [k, { before_break: {}, after_break: {} }]))
  for (const r of rows) {
    const day = byDay.get(r.date)
    if (day && day[r.session]) day[r.session][r.status] = (day[r.session][r.status] ?? 0) + r.count
  }
  const out = []
  for (const key of dayKeys) {
    const d = byDay.get(key)
    const before = sessionSummary(d.before_break).percent
    const after = sessionSummary(d.after_break).percent
    if (before !== null || after !== null) out.push({ date: key, before, after })
  }
  return out
}

// Natiijada imtixaan: isla xeerka promotion-ka iyo UI-ga (total >= passMark = gudbay).
// results: [{ classId, total, hasMarks }] — kuwa marks leh KALIYA ayaa la tirinayaa.
function passStats(results, passMark) {
  const valid = results.filter((r) => r.hasMarks)
  const passed = valid.filter((r) => r.total >= passMark).length
  const byClassMap = new Map()
  for (const r of valid) {
    const key = String(r.classId)
    if (!byClassMap.has(key)) byClassMap.set(key, { classId: key, students: 0, passed: 0 })
    const c = byClassMap.get(key)
    c.students += 1
    if (r.total >= passMark) c.passed += 1
  }
  return {
    students: valid.length,
    passed,
    failed: valid.length - passed,
    passRatePercent: pct(passed, valid.length),
    averageTotal: valid.length ? Math.round((valid.reduce((s, r) => s + r.total, 0) / valid.length) * 10) / 10 : null,
    byClass: [...byClassMap.values()].map((c) => ({ ...c, passRatePercent: pct(c.passed, c.students) })),
  }
}

// Imisa arday ayaa leh sabab nooc kasta (arday mid ah wuxuu ku jiri karaa dhowr).
function riskBreakdown(students) {
  const out = { attendance: 0, fees: 0, results: 0 }
  for (const s of students) {
    for (const t of new Set(s.reasons.map((r) => r.type))) if (t in out) out[t] += 1
  }
  return out
}

module.exports = {
  pct, sessionSummary, localDateKey, monthKey, lastMonthKeys, lastDayKeys,
  buildAttendanceTrend, passStats, riskBreakdown,
}
