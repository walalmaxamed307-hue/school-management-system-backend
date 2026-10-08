// Xisaabinta "ardayda khatarta ah" — PURE functions (DB ma u baahna), si
// fudud loo test-gareeyo. Controller-ku (riskStudentsController) ayaa xogta
// ka soo qaada DB oo halkan u gudbiya.
//
// Saddex signal ayaa jira; arday kasta oo mid ama ka badan buuxiya waa
// "khatar". Xadadka hoose waa meel keliya — halkan ka beddel haddii iskuulku
// rabo xeer kale.

const RISK_CONFIG = {
  attendanceWindowDays: 30, // attendance-ka sidee u eegtaa: 30-kii maalmood ee la soo dhaafay
  attendanceMinSessions: 6, // ugu yaraan intaa session oo la calaamadiyay (si aan xog yar loo xukumin)
  attendanceMinRate: 0.75, // ka hooseeya 75% = khatar
  feeMinUnpaidMonths: 2, // 2 bilood ama ka badan oo aan la bixin = khatar
  resultMinFailedExams: 2, // 2 imtixaan ama ka badan oo uu "dhacay" = khatar
}

// Attendance: (present + late) / (present + late + absent). 'excused' waa
// maqnaansho cudurdaar leh — ma ciqaabayno (laga saaray labada dhinac).
function attendanceSignal({ present = 0, late = 0, absent = 0 }, cfg = RISK_CONFIG) {
  const attended = present + late
  const sessions = attended + absent
  if (sessions < cfg.attendanceMinSessions) return { flag: false, rate: null, sessions }
  const rate = attended / sessions
  return { flag: rate < cfg.attendanceMinRate, rate, sessions }
}

// Fees: bilaha "lacag-qaadista" waa kuwa Fee doc leh ugu yaraan hal arday
// (billingMonths, bisha hadda socota lagama tirinayo). Arday kasta wuxuu
// "lagu leeyahay" bil haddii: bisha >= bisha uu is-diiwaangeliyay, uusan
// 'free' ahayn, amountDue > 0, oo uusan 'paid' ahayn (doc la'aan = unpaid).
// feeDocsByMonth: { 'YYYY-MM': { amountDue, amountPaid, status } }
function feeSignal(
  { student, enrolledMonth, billingMonths, feeDocsByMonth, standardAmount },
  cfg = RISK_CONFIG
) {
  if (student.feeCategory === 'free') return { flag: false, owingMonths: 0, owedAmount: 0, months: [] }

  let implicitDue = standardAmount
  if (student.feeCategory === 'discount') {
    implicitDue = Math.max(0, standardAmount - (student.discountAmount || 0))
  }

  const months = []
  let owedAmount = 0
  for (const month of billingMonths) {
    if (enrolledMonth && month < enrolledMonth) continue
    const doc = feeDocsByMonth[month]
    if (doc) {
      if (doc.amountDue <= 0 || doc.status === 'paid') continue
      months.push(month)
      owedAmount += Math.max(0, doc.amountDue - (doc.amountPaid || 0))
    } else {
      // Doc ma jiro = weli waxba lagama qaadin. Haddii standard fee la dejin
      // (0), ma ogsoonin karno inuu lacag ku leeyahay — ha calaamadin.
      if (implicitDue <= 0) continue
      months.push(month)
      owedAmount += implicitDue
    }
  }
  return {
    flag: months.length >= cfg.feeMinUnpaidMonths,
    owingMonths: months.length,
    owedAmount,
    months,
  }
}

// Natiijo: isla xeerka promotion-ka iyo UI-ga — total (wadarta maadooyinka)
// < passMark = "Dhacay". Imtixaanada la daabacay (published) oo marks leh KALIYA.
// results: [{ examId, total, hasMarks }]
function resultSignal({ results, passMark }, cfg = RISK_CONFIG) {
  const failedExamIds = results
    .filter((r) => r.hasMarks && r.total < passMark)
    .map((r) => String(r.examId))
  return { flag: failedExamIds.length >= cfg.resultMinFailedExams, failedExamIds }
}

// 2+ signal = 'high', 1 = 'medium'. Haddii 0 -> null (khatar ma aha).
function riskLevel(signalCount) {
  if (signalCount >= 2) return 'high'
  if (signalCount === 1) return 'medium'
  return null
}

module.exports = { RISK_CONFIG, attendanceSignal, feeSignal, resultSignal, riskLevel }
