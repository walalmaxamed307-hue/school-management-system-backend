// SMOKE TEST — wuxuu ku tijaabiyaa server-ka socda (ma aha unit test) dhammaan
// wareegga muhiimka ah: platform -> iskuul -> admin/macalin/arday -> attendance
// -> fees -> exams/publish -> room-split -> transfer (ansixin/diidmo) ->
// promotion, iyo GO'DOOMINTA iskuullada (tenant isolation).
//
// KA DIGTOONOW: wuxuu abuuraa 2 iskuul oo tijaabo ah ("SMOKE ...") database-ka
// server-ka uu ku xiran yahay. Ku orod database TIJAABO ah, ama ka dib ka tirtir
// Compass. Marka uu dhammaado iskuullada tijaabada waa la xidhaa (Inactive).
//
// Sida loo isticmaalo (server-ku waa in uu socdaa, .env-ku waa in uu leeyahay
// PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD, oo `npm run seed` la rooray):
//   npm run smoke
//   BASE_URL=https://api.iskuulkaaga.so npm run smoke
//
// FIIRO: login-ku wuxuu leeyahay rate-limit (5 isku-day / 15 daqiiqo ee IP +
// account isku mid ah, login guulaystay lama tirinayo). Script-kan wuxuu si
// ula kac ah u sameeyaa 2 login oo qaldan (account kala duwan), sidaas darteed
// waa ammaan in la orodo dhowr jeer.

require('dotenv').config()

const BASE = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '')
const PLATFORM_EMAIL = process.env.PLATFORM_ADMIN_EMAIL
const PLATFORM_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD
const RUN = Date.now().toString(36)
const PASS = 'Smoke#1234'

let passed = 0
const failures = []

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`  ✅ ${name}`)
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function call(method, path, { token, body } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch (err) {
    throw new Error(`Server-ka lama gaari karo (${BASE}). Ma socdaa? (${err.message})`)
  }
  let data = null
  if (res.status !== 204) {
    try {
      data = await res.json()
    } catch {
      data = null
    }
  }
  // FIIRO: 429 (rate-limit) lama tuurayo halkan — qaybta 17 waxay si ula kac
  // ah u soo dhaliyaa 429 si ay u tijaabiso limiter-ka; haddii halkan la
  // tuuro, script-ku wuu jabi lahaa intii uusan check()-ku eegin status-ka.
  // Haddii 429 uu ka dhaco meel kale oo aan la filayn, check-gaas otomaatig
  // ahaan wuu fashilmayaa isagoo muujinaya "status 429" — sax oo cad.
  return { status: res.status, data }
}

const idOf = (d) => d?._id ?? d?.id
const section = (t) => console.log(`\n${t}`)
const errOf = (r) => `status ${r.status} ${JSON.stringify(r.data)?.slice(0, 160)}`

async function main() {
  if (!PLATFORM_EMAIL || !PLATFORM_PASSWORD) {
    throw new Error('PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD ma jiraan .env — ku dar oo orod `npm run seed`.')
  }
  console.log(`Smoke test -> ${BASE}  (run ${RUN})`)

  // ------------------------------------------------------------------ health
  section('1. Server + amniga aasaasiga ah')
  const health = await call('GET', '/health')
  check('GET /health waa OK', health.status === 200, errOf(health))
  const noToken = await call('GET', '/classes')
  check('Token la\'aan -> 401', noToken.status === 401, errOf(noToken))

  // --------------------------------------------------------------- platform
  section('2. Platform admin: abuur 2 iskuul')
  const pl = await call('POST', '/platform/auth/login', { body: { email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD } })
  check('Platform login', pl.status === 200 && !!pl.data?.token, errOf(pl))
  const P = pl.data.token

  const mk = async (label) => {
    const r = await call('POST', '/platform/schools', {
      token: P,
      body: {
        schoolName: `SMOKE ${label} ${RUN}`,
        adminName: `Admin ${label}`,
        adminEmail: `smoke-${label.toLowerCase()}-${RUN}@test.local`,
        adminPassword: PASS,
      },
    })
    check(`Abuur iskuul ${label}`, r.status === 201, errOf(r))
    return { id: r.data?.school?.id, email: `smoke-${label.toLowerCase()}-${RUN}@test.local` }
  }
  const schoolA = await mk('A')
  const schoolB = await mk('B')

  const list = await call('GET', '/platform/schools', { token: P })
  const rowA = (list.data || []).find((s) => String(s._id) === String(schoolA.id))
  check('Platform list wuxuu tusaa admin email-ka', rowA?.adminEmail === schoolA.email, errOf(list))

  // ---------------------------------------------------------- admin logins
  section('3. Admin login (email kaliya)')
  const la = await call('POST', '/auth/login', { body: { email: schoolA.email, password: PASS } })
  check('Admin A login', la.status === 200 && la.data?.user?.role === 'admin', errOf(la))
  const lb = await call('POST', '/auth/login', { body: { email: schoolB.email, password: PASS } })
  check('Admin B login', lb.status === 200, errOf(lb))
  const A = la.data.token
  const B = lb.data.token
  const me = await call('GET', '/auth/me', { token: A })
  check('GET /auth/me wuxuu soo celiyaa profile', me.status === 200 && me.data?.user?.role === 'admin', errOf(me))

  // -------------------------------------------------------- master data (A)
  section('4. Sanad dugsiyeed + fasallo + maado (iskuul A)')
  const yearA = await call('POST', '/academic-years', { token: A, body: { startYear: 2025, endYear: 2026, label: '2025-2026' } })
  check('Sanadka koowaad wuxuu noqdaa active', yearA.status === 201 && yearA.data?.status === 'active', errOf(yearA))
  const yearB = await call('POST', '/academic-years', { token: B, body: { startYear: 2025, endYear: 2026, label: '2025-2026' } })
  check('Sanad iskuul B', yearB.status === 201, errOf(yearB))

  const c1 = await call('POST', '/classes', { token: A, body: { name: 'Fasalka 1', level: 1 } })
  const c2 = await call('POST', '/classes', { token: A, body: { name: 'Fasalka 2', level: 2 } })
  check('Abuur 2 fasal (A)', c1.status === 201 && c2.status === 201, `${errOf(c1)} | ${errOf(c2)}`)
  const class1 = idOf(c1.data)
  const class2 = idOf(c2.data)
  const cB = await call('POST', '/classes', { token: B, body: { name: 'Fasalka 1', level: 1 } })
  check('Abuur fasal (B) — isla magac, iskuul kale, waa la oggol yahay', cB.status === 201, errOf(cB))

  const subj = await call('POST', '/subjects', { token: A, body: { name: 'Xisaab' } })
  check('Abuur maado', subj.status === 201, errOf(subj))
  const subjectId = idOf(subj.data)

  const st = await call('PATCH', '/school-settings', { token: A, body: { defaultStandardFeeAmount: 20, defaultPassMark: 50 } })
  check('Settings: fee=20, pass=50', st.status === 200, errOf(st))

  // --------------------------------------------------------- tenant isolation
  section('5. GO\'DOOMINTA IISKUULLADA (tenant isolation)')
  const bClasses = await call('GET', '/classes', { token: B })
  check('Admin B ma arko fasallada A', Array.isArray(bClasses.data) && !bClasses.data.some((c) => String(c._id) === String(class1)), errOf(bClasses))
  const bSubjects = await call('GET', '/subjects', { token: B })
  check('Admin B ma arko maadooyinka A', Array.isArray(bSubjects.data) && bSubjects.data.length === 0, errOf(bSubjects))
  const hijack = await call('PATCH', `/classes/${class1}`, { token: B, body: { name: 'HACKED' } })
  check('Admin B ma beddeli karo fasalka A', hijack.status === 404, errOf(hijack))
  const crossStudent = await call('POST', '/students', {
    token: B,
    body: { fullName: 'Cross Tenant', classId: class1, dob: '2015-01-01', feeCategory: 'paid' },
  })
  check('Admin B ma abuuri karo arday fasalka A', crossStudent.status >= 400 && crossStudent.status < 500, errOf(crossStudent))

  // ---------------------------------------------------------------- teacher
  section('6. Macalin: homeroom + maado')
  const tEmail = `smoke-teacher-${RUN}@test.local`
  const tr = await call('POST', '/teachers', {
    token: A,
    body: {
      name: 'Macalin Smoke',
      email: tEmail,
      password: PASS,
      phone: '0610000000',
      homeroom: { classId: class1, sectionId: null },
      assignments: [{ classId: class1, sectionId: null, subjectId }],
    },
  })
  check('Abuur macalin', tr.status === 201, errOf(tr))
  const lt = await call('POST', '/auth/login', { body: { email: tEmail, password: PASS } })
  check('Macalin login + assignments', lt.status === 200 && lt.data?.user?.assignments?.length === 1, errOf(lt))
  const T = lt.data.token
  const dupEmail = await call('POST', '/teachers', { token: B, body: { name: 'Dup', email: tEmail, password: PASS } })
  check('Email waa gebi ahaanba unique (iskuul kale ma isticmaali karo)', dupEmail.status === 409, errOf(dupEmail))

  // ---------------------------------------------------------------- students
  section('7. Ardayda + login-ka ardayga')
  const mkStudent = async (name) =>
    call('POST', '/students', {
      token: A,
      body: { fullName: name, classId: class1, dob: '2015-05-05', parentName: 'Waalid', parentPhone: '0615000000', feeCategory: 'paid' },
    })
  const s1 = await mkStudent('Arday Kowaad')
  const s2 = await mkStudent('Arday Labaad')
  check('Abuur 2 arday', s1.status === 201 && s2.status === 201, `${errOf(s1)} | ${errOf(s2)}`)
  check('studentCode waa la abuuray (STU-…)', /^STU-\d+/.test(s1.data?.studentCode || ''), errOf(s1))
  const noDob = await call('POST', '/students', { token: A, body: { fullName: 'No Dob', classId: class1 } })
  check('Arday dob la\'aan waa la diidayaa', noDob.status === 400, errOf(noDob))
  const bStudents = await call('GET', '/students', { token: B })
  check('Admin B ma arko ardayda A', Array.isArray(bStudents.data) && bStudents.data.length === 0, errOf(bStudents))

  const badDob = await call('POST', '/auth/student-login', { body: { studentCode: s1.data.studentCode, dob: '2000-01-01' } })
  check('Student login: dob qaldan -> 401', badDob.status === 401, errOf(badDob))
  const ls = await call('POST', '/auth/student-login', { body: { studentCode: s1.data.studentCode, dob: '2015-05-05' } })
  check('Student login: ID + dob sax', ls.status === 200 && ls.data?.user?.role === 'student', errOf(ls))
  const S = ls.data.token
  const stuList = await call('GET', '/students', { token: S })
  check('Student token ma arki karo liiska ardayda (403)', stuList.status === 403, errOf(stuList))

  // -------------------------------------------------------------- attendance
  section('8. Attendance (Kahor / Kadib Break)')
  const today = new Date().toISOString().slice(0, 10)
  const att = await call('GET', `/attendance?classId=${class1}&date=${today}&session=before_break`, { token: T })
  check('Macalinku wuxuu arkaa 2 arday', att.status === 200 && att.data?.length === 2, errOf(att))
  const en1 = s1.data.enrollmentId
  const en2 = s2.data.enrollmentId
  const mark = await call('POST', '/attendance', { token: T, body: { enrollmentId: en1, date: today, session: 'before_break', status: 'present' } })
  check('Calaamadi present', mark.status < 300, errOf(mark))
  const mark2 = await call('POST', '/attendance', { token: T, body: { enrollmentId: en2, date: today, session: 'after_break', status: 'absent' } })
  check('Calaamadi absent (Kadib Break)', mark2.status < 300, errOf(mark2))
  const abs = await call('GET', `/students/${s2.data.id}/absences`, { token: A })
  check('Tirada maalmaha maqnaanshaha', abs.status === 200 && abs.data?.absentDays === 1, errOf(abs))

  // -------------------------------------------------------------------- fees
  section('9. Fees')
  const month = today.slice(0, 7)
  const fees = await call('GET', `/fees?classId=${class1}&month=${month}`, { token: A })
  check('GET /fees: amountDue = 20', fees.status === 200 && fees.data?.[0]?.amountDue === 20, errOf(fees))
  const pay = await call('POST', '/fees', { token: A, body: { enrollmentId: en1, month, amountPaid: 10 } })
  check('Bixin qayb (10/20) -> partial', pay.status < 300 && (pay.data?.status === 'partial' || pay.data?.amountPaid === 10), errOf(pay))
  const over = await call('POST', '/fees', { token: A, body: { enrollmentId: en1, month, amountPaid: 999 } })
  check('Bixin ka badan amountDue waa la diidayaa', over.status === 400, errOf(over))
  const neg = await call('POST', '/fees', { token: A, body: { enrollmentId: en1, month, amountPaid: -5 } })
  check('Lacag negative waa la diidayaa', neg.status === 400, errOf(neg))
  const teachFees = await call('GET', `/fees?classId=${class1}&month=${month}`, { token: T })
  check('Macalinku ma arki karo fees (403)', teachFees.status === 403, errOf(teachFees))

  // ------------------------------------------------------------------- exams
  section('10. Exams: term, dhibco, rank, publish, portal-ka ardayga')
  const ex = await call('POST', '/exams', { token: A, body: { name: 'Final Exam', isFinal: true, order: 0 } })
  check('Abuur term (Final Exam)', ex.status === 201, errOf(ex))
  const examId = idOf(ex.data)
  const m1 = await call('PUT', `/exams/${examId}/results`, { token: T, body: { enrollmentId: en1, subjectId, mark: 80 } })
  const m2 = await call('PUT', `/exams/${examId}/results`, { token: T, body: { enrollmentId: en2, subjectId, mark: 90 } })
  check('Macalinku wuxuu geliyaa dhibco', m1.status < 300 && m2.status < 300, `${errOf(m1)} | ${errOf(m2)}`)
  const badMark = await call('PUT', `/exams/${examId}/results`, { token: T, body: { enrollmentId: en1, subjectId, mark: 1000 } })
  check('Dhibco ka badan max waa la diidayaa', badMark.status === 400, errOf(badMark))
  const res = await call('GET', `/exams/${examId}/results?classId=${class1}`, { token: A })
  const rows = res.data?.rows || []
  check('GET results ma jabo (500 bug-kii hore)', res.status === 200, errOf(res))
  check('Total + rank: 90 = #1, 80 = #2', rows.find((r) => r.enrollmentId === en2)?.rank === 1 && rows.find((r) => r.enrollmentId === en1)?.total === 80, JSON.stringify(rows).slice(0, 200))
  const early = await call('GET', '/my-results', { token: S })
  check('Ardaygu ma arko natiijo aan published ahayn', early.status === 200 && early.data?.[0]?.published === false, errOf(early))
  const pub = await call('POST', `/exams/${examId}/publish`, { token: A, body: { classId: class1 } })
  check('Publish waa guulaystay (ma jiro 500)', pub.status === 200, errOf(pub))
  const resAfter = await call('GET', `/exams/${examId}/results?classId=${class1}`, { token: A })
  check('Results kadib publish waa shaqeeyaan', resAfter.status === 200 && resAfter.data?.allPublished === true, errOf(resAfter))
  const mine = await call('GET', '/my-results', { token: S })
  check('Ardaygu wuxuu arkaa natiijadiisa (total 80, kaalin 2)', mine.data?.[0]?.published === true && mine.data[0].total === 80 && mine.data[0].rank === 2, errOf(mine))
  const foreignExam = await call('GET', `/exams/${examId}/results?classId=${cB.data ? idOf(cB.data) : class1}`, { token: B })
  check('Admin B ma arki karo exam-ka iskuul A', foreignExam.status === 404, errOf(foreignExam))
  const teacherOwnClass = await call('GET', `/exams/${examId}/results?classId=${class1}`, { token: T })
  check('Macalinku wuxuu arkaa fasalkiisa (homeroom+assignment)', teacherOwnClass.status === 200, errOf(teacherOwnClass))
  const teacherOtherClass = await call('GET', `/exams/${examId}/results?classId=${class2}`, { token: T })
  check('Macalinku ma arki karo fasal uusan la xiriirin (403)', teacherOtherClass.status === 403, errOf(teacherOtherClass))

  // ------------------------------------------------------------- room split
  section('11. Room-split')
  const room = await call('POST', '/rooms', { token: A, body: { name: 'Room 1' } })
  check('Abuur room', room.status === 201, errOf(room))
  const split = await call('POST', `/exams/${examId}/room-split`, { token: A, body: { classIds: [class1], roomIds: [idOf(room.data)] } })
  check('Kala qaybi ardayda', split.status < 300, errOf(split))
  const getSplit = await call('GET', `/exams/${examId}/room-split`, { token: A })
  check('Room 1 wuxuu haystaa 2 arday', getSplit.status === 200 && getSplit.data?.['Room 1']?.length === 2, errOf(getSplit))
  const myRoom = await call('GET', '/my-room', { token: S })
  check('Ardaygu wuxuu arkaa qolkiisa', myRoom.data?.roomName === 'Room 1', errOf(myRoom))

  // ------------------------------------------------------------ announcements
  section('12. Ogeysiisyada')
  const an = await call('POST', '/announcements', { token: A, body: { title: 'Smoke', body: 'Test announcement' } })
  check('Admin wuxuu qoraa ogeysiis', an.status === 201, errOf(an))
  const anStu = await call('GET', '/announcements', { token: S })
  check('Ardaygu wuxuu arkaa ogeysiiska', anStu.status === 200 && anStu.data?.some((a) => a.title === 'Smoke'), errOf(anStu))
  const anB = await call('GET', '/announcements', { token: B })
  check('Iskuul B ma arko ogeysiiska A', anB.status === 200 && anB.data?.length === 0, errOf(anB))
  const anPost = await call('POST', '/announcements', { token: S, body: { title: 'x', body: 'y' } })
  check('Ardaygu ma qori karo ogeysiis (403)', anPost.status === 403, errOf(anPost))

  // --------------------------------------------------------------- dashboard
  section('13. Dashboard')
  const dash = await call('GET', '/dashboard/stats', { token: A })
  check('Dashboard: 2 arday, 1 macalin', dash.status === 200 && dash.data?.totalStudents === 2 && dash.data?.totalTeachers === 1, errOf(dash))
  check('Dashboard: attendance Kahor/Kadib Break la kala saaray', !!dash.data?.attendanceToday?.before_break && !!dash.data?.attendanceToday?.after_break, errOf(dash))
  const dashB = await call('GET', '/dashboard/stats', { token: B })
  check('Dashboard B ma tiriyo ardayda A', dashB.data?.totalStudents === 0, errOf(dashB))

  // --------------------------------------------------------------- transfers
  section('14. Wareejin: ansixin + diidmo (admin B ayaa go\'aamiya)')
  const tr1 = await call('POST', `/students/${s1.data.id}/transfer`, { token: A, body: { toSchoolId: schoolB.id } })
  const tr2 = await call('POST', `/students/${s2.data.id}/transfer`, { token: A, body: { toSchoolId: schoolB.id } })
  check('Wareejin 2 arday -> "initiated"', tr1.data?.initiated === true && tr2.data?.initiated === true, `${errOf(tr1)} | ${errOf(tr2)}`)
  const bBefore = await call('GET', '/students', { token: B })
  check('Ka hor ansixinta, B ma haysto arday', bBefore.data?.length === 0, errOf(bBefore))
  const pend = await call('GET', '/transfers/pending', { token: B })
  check('B wuxuu arkaa 2 wareejin oo sugaya', pend.status === 200 && pend.data?.length === 2, errOf(pend))
  const p1 = pend.data.find((p) => p.studentName === 'Arday Kowaad')
  const p2 = pend.data.find((p) => p.studentName === 'Arday Labaad')
  const wrongAdmin = await call('POST', `/transfers/${p1.id}/accept`, { token: A })
  check('Iskuulka wareejiyay ma ansixin karo (404)', wrongAdmin.status === 404, errOf(wrongAdmin))
  const acc = await call('POST', `/transfers/${p1.id}/accept`, { token: B })
  check('B wuu ansixiyay', acc.status === 200 && /^STU-/.test(acc.data?.studentCode || ''), errOf(acc))
  const rej = await call('POST', `/transfers/${p2.id}/reject`, { token: B })
  check('B wuu diiday', rej.status === 200, errOf(rej))
  const bAfter = await call('GET', '/students', { token: B })
  check('B hadda wuxuu haystaa 1 arday (kii la ansixiyay)', bAfter.data?.length === 1 && bAfter.data[0].name === 'Arday Kowaad', errOf(bAfter))
  const aAfter = await call('GET', '/students', { token: A })
  const back = (aAfter.data || []).find((s) => s.name === 'Arday Labaad')
  const gone = (aAfter.data || []).find((s) => s.name === 'Arday Kowaad')
  check('Kii la diiday wuxuu ku noqday A isagoo active', back?.status === 'active', errOf(aAfter))
  check('Kii la ansixiyay A wuxuu ku jiraa "transferred"', gone?.status === 'transferred', errOf(aAfter))

  section('14b. Arday la wareejiyay ma muuqdo attendance / fees / results')
  const attB = await call('GET', `/attendance?classId=${class1}&date=${today}&session=before_break`, { token: T })
  check('Attendance: Arday Kowaad (la wareejiyay) ma muuqdo', attB.status === 200 && !attB.data?.some((r) => r.name === 'Arday Kowaad'), errOf(attB))
  const feeB = await call('GET', `/fees?classId=${class1}&month=${month}`, { token: A })
  check('Fees: Arday Kowaad ma muuqdo', feeB.status === 200 && !feeB.data?.some((r) => r.name === 'Arday Kowaad'), errOf(feeB))
  const resB = await call('GET', `/exams/${examId}/results?classId=${class1}`, { token: A })
  check('Results: Arday Kowaad ma muuqdo', resB.status === 200 && !resB.data?.rows?.some((r) => r.name === 'Arday Kowaad'), errOf(resB))

  // --------------------------------------------------------------- promotion
  section('15. Promotion (Arday Labaad: 90 >= 50 -> Fasalka 2)')
  const ny = await call('POST', '/academic-years', { token: A, body: { startYear: 2026, endYear: 2027, label: '2026-2027' } })
  check('Sanadka xiga = upcoming', ny.status === 201 && ny.data?.status === 'upcoming', errOf(ny))
  const promo = await call('POST', '/promotions/run', { token: A, body: { toAcademicYearId: idOf(ny.data) } })
  check('Promotion ma jabo (500)', promo.status === 200, errOf(promo))
  check('1 arday ayaa gudbay, 0 fashilmay', promo.data?.promoted === 1 && (promo.data?.failed || []).length === 0, JSON.stringify(promo.data))
  const afterPromo = await call('GET', '/students', { token: A })
  const moved = (afterPromo.data || []).find((s) => s.name === 'Arday Labaad')
  check('Arday Labaad hadda wuxuu ku jiraa Fasalka 2', moved?.class === 'Fasalka 2', errOf(afterPromo))
  const me2 = await call('POST', '/auth/student-login', { body: { studentCode: s2.data.studentCode, dob: '2015-05-05' } })
  check('Ardaygu wuu galaa sanadka cusub', me2.status === 200 && me2.data?.user?.class === 'Fasalka 2', errOf(me2))

  // ---------------------------------------------------- platform edit/inactive
  section('16. Platform admin: edit + xidhid iskuul')
  const edit = await call('PATCH', `/platform/schools/${schoolB.id}`, { token: P, body: { name: `SMOKE B ${RUN} (edited)`, adminName: 'Admin B2', adminEmail: schoolB.email, adminPassword: 'NewPass#456' } })
  check('Edit: magac + admin + password', edit.status === 200 && edit.data?.adminName === 'Admin B2', errOf(edit))
  const oldPw = await call('POST', '/auth/login', { body: { email: schoolB.email, password: PASS } })
  check('Password-kii hore ma shaqeeyo (401)', oldPw.status === 401, errOf(oldPw))
  const off = await call('PATCH', `/platform/schools/${schoolB.id}`, { token: P, body: { isActive: false } })
  check('Xidh iskuul B (Inactive)', off.status === 200 && off.data?.isActive === false, errOf(off))
  const blocked = await call('GET', '/auth/me', { token: B })
  check('Iskuul la xidhay: session-kii hore waa go\'aa (403)', blocked.status === 403, errOf(blocked))
  const offLogin = await call('POST', '/auth/login', { body: { email: schoolB.email, password: 'NewPass#456' } })
  check('Iskuul la xidhay: login waa la diidayaa (403)', offLogin.status === 403, errOf(offLogin))

  section('17. Login rate-limit (5 isku-day / 15 daqiiqo)')
  const ghost = `nobody-${RUN}@test.local`
  let lastStatus = 0
  for (let i = 0; i < 6; i += 1) lastStatus = (await call('POST', '/auth/login', { body: { email: ghost, password: 'wrong-pass' } })).status
  check('Isku-dayga 6aad ee account qaldan -> 429', lastStatus === 429, `status ${lastStatus}`)
  const stillOk = await call('POST', '/auth/login', { body: { email: schoolA.email, password: PASS } })
  check('Account kale oo isla IP ah wuu galaa (iskuulka lama xidhin)', stillOk.status === 200, errOf(stillOk))

  // ----------------------------------------------------------------- cleanup
  await call('PATCH', `/platform/schools/${schoolA.id}`, { token: P, body: { isActive: false } })
  console.log('\n(Iskuullada tijaabada "SMOKE …" waa la xidhay — Compass ka tirtir haddii aad rabto.)')
}

main()
  .catch((err) => {
    failures.push(`SCRIPT ERROR: ${err.message}`)
    console.log(`\n💥 ${err.message}`)
  })
  .finally(() => {
    console.log(`\n==== NATIIJO: ${passed} guulaystay, ${failures.length} fashilmay ====`)
    if (failures.length) {
      console.log(failures.map((f) => ` - ${f}`).join('\n'))
      process.exit(1)
    }
    process.exit(0)
  })
