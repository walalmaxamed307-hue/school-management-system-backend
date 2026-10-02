// Developer-side Student Excel import — CREATE ONLY.
//
// Waxay isticmaashaa isla models-ka iyo isla talaabooyinka ay isticmaasho
// controllers/studentController.js `create` (Counter -> Student -> Enrollment,
// Student waa la tirtiraa haddii Enrollment fashilmo). Ma beddesho schema,
// route, controller, ama xog jirta. MA tirtirto, MA update-gareyso, MA drop-gareyso.
//
// Usage (laga ordo backend/ folder-ka):
//   node scripts/importStudents.js students.xlsx --schoolId=<id> --dry-run
//   node scripts/importStudents.js students.xlsx --schoolId=<id> --limit=3
//   node scripts/importStudents.js students.xlsx --schoolId=<id>
//
// Options:
//   --schoolId=<id>          (ama env SCHOOL_ID)            REQUIRED
//   --academicYearId=<id>    (ama env ACADEMIC_YEAR_ID)     default: active year-ka iskuulka
//   --dry-run                akhri + validate + muuji, DATABASE-KA WAX LAGU QORO MAYO
//   --limit=N                geli kaliya N arday ee ugu horreeya ee saxan (tijaabo)
//   --sheet=<name>           default: sheet-ka ugu horreeya
//   --date-format=dmy|mdy    marka taariikhaha qoraalka ah (text) ay ku jiraan 05/03/2012
//   --report=<file.csv>      qor natiijo CSV ah (imported / skipped / failed)
//   --yes                    ha weydiin xaqiijin (kaliya haddii aad hubto)
//
// MONGODB_URI waxaa laga akhriyaa backend/.env (isla magaca server-ku isticmaalo).

const fs = require('fs')
const path = require('path')

const OBJECT_ID_RE = /^[a-f\d]{24}$/i
const MIN_DOB = Date.UTC(1950, 0, 1)
const FEE_CATEGORIES = ['paid', 'free', 'discount']

// ---------- Header aliases (normalized: lowercase, xarfo/lambar kaliya) ----------
const HEADER_ALIASES = {
  fullName: ['name', 'fullname', 'studentname', 'magac', 'magaca', 'magacaardayga'],
  dob: ['dob', 'dateofbirth', 'birthdate', 'birthday', 'dhalasho', 'taariikhdhalasho'],
  grade: ['grade', 'class', 'classname', 'fasal', 'fasalka','Form'],
  section: ['section', 'sectionname', 'qaybta'],
  parentName: ['parentname', 'parent', 'guardian', 'guardianname', 'waalid', 'waalidka'],
  parentPhone: ['parentphone', 'phone', 'parentmobile', 'mobile', 'guardianphone', 'telefoon', 'tel'],
  feeCategory: ['feecategory', 'fee', 'feetype'],
  discountAmount: ['discountamount', 'discount'],
  // Waa la aqoonsadaa laakiin Student schema-gu ma haysto — waa la ilaaliyaa (ignored).
  gender: ['gender', 'sex', 'jinsi', 'jinsiga'],
}

// ---------- Pure helpers (la tijaabin karo database la'aanteed) ----------
function normHeader(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normName(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function cellToString(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  return String(v).trim().replace(/\s+/g, ' ')
}

function isEmptyRow(cells) {
  return cells.every((c) => cellToString(c) === '')
}

function parseArgs(argv) {
  const out = { flags: {}, opts: {}, positional: [] }
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq === -1) out.flags[a.slice(2)] = true
      else out.opts[a.slice(2, eq)] = a.slice(eq + 1)
    } else {
      out.positional.push(a)
    }
  }
  return out
}

// header row -> { map: {field: columnIndex}, ignored: [header names], missing: [required fields] }
function mapHeaders(headerRow) {
  const map = {}
  const ignored = []
  headerRow.forEach((h, idx) => {
    const n = normHeader(h)
    if (!n) return
    const field = Object.keys(HEADER_ALIASES).find((f) => HEADER_ALIASES[f].includes(n))
    if (field && map[field] === undefined) map[field] = idx
    else ignored.push(cellToString(h))
  })
  const missing = ['fullName', 'dob', 'grade'].filter((f) => map[f] === undefined)
  return { map, ignored, missing }
}

function buildDate(y, m, d) {
  const t = Date.UTC(y, m - 1, d)
  const dt = new Date(t)
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt
}

// Waxay soo celisaa { date } ama { error }. Taariikhda waa UTC midnight —
// student login-ku wuxuu isbarbar dhigaa dob.toISOString().slice(0,10).
function parseDob(value, dateFormat, now = new Date()) {
  let date = null

  if (typeof value === 'number') {
    // Excel serial date (1900 system). Saacadaha jajabka ah waa la tuuraa.
    date = new Date(
      Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000
    )

    if (Number.isNaN(date.getTime())) {
      return { error: 'DOB is not a valid date' }
    }
  } else {
    const s = cellToString(value)

    if (!s) {
      return { error: 'DOB is missing' }
    }

    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)

    if (m) {
      // YYYY-MM-DD
      date = buildDate(+m[1], +m[2], +m[3])
    } else if (
      (m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))
    ) {
      const a = +m[1]
      const b = +m[2]
      const y = +m[3]

      let day
      let month

      if (dateFormat === 'mdy') {
        // Month / Day / Year
        [month, day] = [a, b]
      } else {
        // Default: Day / Month / Year
        [day, month] = [a, b]
      }

      date = buildDate(y, month, day)
    } else {
      return {
        error: `DOB "${s}" is not a recognised date (use YYYY-MM-DD or a real Excel date)`
      }
    }

    if (!date) {
      return {
        error: `DOB "${s}" is not a valid calendar date`
      }
    }
  }

  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  )

  if (date.getTime() < MIN_DOB || date.getTime() > todayUtc) {
    return {
      error: `DOB ${date.toISOString().slice(0, 10)} is outside the allowed range (1950-01-01 … today)`
    }
  }

  return { date }
}
// ctx: { classesByName: Map(norm -> class), sectionsByClass: Map(classId -> Map(norm -> section)), dateFormat }
// Soo celisaa { data } ama { errors: [] } — waxay ku salaysan tahay xeerarka controller-ka + Enrollment hook.
function parseRow(cells, map, ctx) {
  const errors = []
  const get = (f) => (map[f] === undefined ? undefined : cells[map[f]])
  const str = (f) => cellToString(get(f))

  const fullName = str('fullName')
  if (!fullName) errors.push('Name is missing')

  const dobRes = parseDob(get('dob'), ctx.dateFormat, ctx.now)
  if (dobRes.error) errors.push(dobRes.error)

  let klass = null
  const gradeRaw = str('grade')
  if (!gradeRaw) {
    errors.push('Grade/Class is missing')
  } else {
    klass = ctx.classesByName.get(normName(gradeRaw)) || null
    if (!klass) {
      const valid = [...ctx.classesByName.values()].map((c) => c.name).join(', ')
      errors.push(`Invalid Grade/Class: "${gradeRaw}" (this school has: ${valid || 'no classes'})`)
    }
  }

  let section = null
  if (klass) {
    const sectionRaw = str('section')
    if (klass.hasSections) {
      if (!sectionRaw) {
        errors.push(`Section is required — ${klass.name} has sections`)
      } else {
        section = ctx.sectionsByClass.get(String(klass._id))?.get(normName(sectionRaw)) || null
        if (!section) {
          const valid = [...(ctx.sectionsByClass.get(String(klass._id))?.values() || [])].map((s) => s.name).join(', ')
          errors.push(`Invalid Section: "${sectionRaw}" for ${klass.name} (valid: ${valid || 'none created'})`)
        }
      }
    } else if (sectionRaw) {
      errors.push(`Section "${sectionRaw}" given but ${klass.name} has no sections`)
    }
  }

  let feeCategory
  const feeRaw = str('feeCategory').toLowerCase()
  if (feeRaw) {
    if (FEE_CATEGORIES.includes(feeRaw)) feeCategory = feeRaw
    else errors.push(`Invalid feeCategory: "${feeRaw}" (use paid, free or discount)`)
  }
  let discountAmount
  const discRaw = get('discountAmount')
  if (cellToString(discRaw) !== '') {
    const n = typeof discRaw === 'number' ? discRaw : Number(cellToString(discRaw))
    if (!Number.isFinite(n) || n < 0) errors.push(`Invalid discountAmount: "${cellToString(discRaw)}"`)
    else discountAmount = n
  }
  const effectiveFee = feeCategory || 'paid'
  if (effectiveFee === 'discount' && discountAmount === undefined && !errors.some((e) => e.startsWith('Invalid discountAmount'))) {
    errors.push('discountAmount is required when feeCategory is "discount"')
  }
  if (effectiveFee !== 'discount' && discountAmount !== undefined) {
    errors.push('discountAmount must be empty unless feeCategory is "discount"')
  }

  if (errors.length > 0) return { errors }
  return {
    data: {
      fullName,
      dob: dobRes.date,
      klass,
      section,
      parentName: str('parentName') || undefined,
      parentPhone: str('parentPhone') || undefined,
      feeCategory,
      discountAmount,
    },
  }
}

function studentKey(fullName, dob) {
  return `${normName(fullName)}|${dob ? dob.toISOString().slice(0, 10) : ''}`
}

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ---------- Excel reading ----------
function readExcel(file, sheetName) {
  const XLSX = require('xlsx') // lazy: kaliya marka script-ku runta
  const wb = XLSX.readFile(file, { cellDates: false })
  const name = sheetName || wb.SheetNames[0]
  const ws = wb.Sheets[name]
  if (!ws) throw new Error(`Sheet "${name}" not found. Sheets in file: ${wb.SheetNames.join(', ')}`)
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const all = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true })
  if (all.length === 0) throw new Error('The sheet is empty')
  // excelRow = tirada saf-ka dhabta ah ee Excel (header = saf-ka ugu horreeya ee la isticmaalo)
  const rows = all.slice(1).map((cells, i) => ({ excelRow: range.s.r + i + 2, cells }))
  return { sheet: name, header: all[0], rows }
}

function confirm(question) {
  return new Promise((resolve) => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function die(msg) {
  console.error(`\nERROR: ${msg}\n`)
  process.exit(1)
}

// ---------- Main ----------
async function main() {
  const { flags, opts, positional } = parseArgs(process.argv.slice(2))
  const file = positional[0]
  if (!file || flags.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(7, 23).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
    process.exit(file ? 0 : 1)
  }
  if (!fs.existsSync(file)) die(`File not found: ${file}`)

  const dryRun = Boolean(flags['dry-run'])
  const schoolId = opts.schoolId || process.env.SCHOOL_ID
  const academicYearIdArg = opts.academicYearId || process.env.ACADEMIC_YEAR_ID
  const dateFormat = opts['date-format']
  const limit = opts.limit === undefined ? Infinity : Number(opts.limit)
  if (!schoolId || !OBJECT_ID_RE.test(schoolId)) die('--schoolId=<24-char id> is required and must be a valid ObjectId')
  if (academicYearIdArg && !OBJECT_ID_RE.test(academicYearIdArg)) die('--academicYearId is not a valid ObjectId')
  if (dateFormat && !['dmy', 'mdy'].includes(dateFormat)) die('--date-format must be dmy or mdy')
  if (!(limit >= 1)) die('--limit must be a positive number')

  // 1) Akhri Excel KA HOR database-ka (khalad halkan = wax database ah lama taaban)
  const excel = readExcel(file, opts.sheet)
  const { map, ignored, missing } = mapHeaders(excel.header)
  if (missing.length > 0) {
    die(`Missing required column(s): ${missing.join(', ')}. Found headers: ${excel.header.map(cellToString).filter(Boolean).join(', ')}`)
  }
  console.log(`Excel: ${path.basename(file)} (sheet "${excel.sheet}")`)
  if (map.gender !== undefined) {
    console.log('NOTE: "Gender" column found but the Student schema has no gender field — it is ignored (not stored).')
  }
  const unknown = ignored.filter((h) => !HEADER_ALIASES.gender.includes(normHeader(h)))
  if (unknown.length > 0) console.log(`NOTE: ignored unknown column(s): ${unknown.join(', ')}`)

  // 2) Connect (isla MONGODB_URI iyo db helper-ka server-ku isticmaalo)
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
  const mongoose = require('mongoose')
  // Script-kan INDEX ma dhisto/ma beddelo (verifyIndexes/syncIndexes MA la wacayo).
  mongoose.set('autoIndex', false)
  mongoose.set('autoCreate', false)
  const { connectDB } = require('../config/db')
  const { School, AcademicYear, Class, Section, Student, Enrollment, Counter } = require('../models')
  await connectDB()
  const dbName = mongoose.connection.name
  const dbHost = mongoose.connection.host

  try {
    const school = await School.findById(schoolId).lean()
    if (!school) die(`schoolId ${schoolId} does not exist in database "${dbName}"`)
    if (school.isActive === false) console.log('WARNING: this school is marked inactive.')

    let year
    if (academicYearIdArg) {
      year = await AcademicYear.findOne({ _id: academicYearIdArg, schoolId }).lean()
      if (!year) die('academicYearId does not exist for this school')
      if (year.status === 'closed') die(`Academic year ${year.label} is closed — cannot enroll students into it`)
    } else {
      year = await AcademicYear.findOne({ schoolId, status: 'active' }).lean()
      if (!year) die('This school has no active academic year (same rule as Add Student). Pass --academicYearId=...')
    }

    const classes = await Class.find({ schoolId }).lean()
    const sections = await Section.find({ schoolId }).lean()
    const classesByName = new Map(classes.map((c) => [normName(c.name), c]))
    const sectionsByClass = new Map()
    for (const s of sections) {
      const k = String(s.classId)
      if (!sectionsByClass.has(k)) sectionsByClass.set(k, new Map())
      sectionsByClass.get(k).set(normName(s.name), s)
    }

    // Arday jira (dhammaan xaaladaha) — duplicate = isku magac (normalized) + isku dob, isku iskuul.
    // Student schema-gu unique kale ma haysto marka studentCode laga reebo.
    const existing = await Student.find({ schoolId }).select('fullName dob studentCode').lean()
    const existingByKey = new Map(existing.map((s) => [studentKey(s.fullName, s.dob), s.studentCode]))

    console.log(`\nDatabase:      ${dbName} @ ${dbHost}`)
    console.log(`School:        ${school.name} (${schoolId})`)
    console.log(`Academic Year: ${year.label} [${year.status}] (${year._id})`)
    console.log(`Mode:          ${dryRun ? 'DRY RUN (no writes)' : 'REAL IMPORT (create only)'}\n`)

    // 3) Validate dhammaan safafka
    const ctx = { classesByName, sectionsByClass, dateFormat, now: new Date() }
    const results = [] // { row, status: 'valid'|'invalid'|'skipped', reasons, data }
    const seenInFile = new Map()
    for (const { excelRow, cells } of excel.rows) {
      if (isEmptyRow(cells)) continue
      const parsed = parseRow(cells, map, ctx)
      if (parsed.errors) {
        results.push({ row: excelRow, status: 'invalid', reasons: parsed.errors })
        continue
      }
      const d = parsed.data
      const key = studentKey(d.fullName, d.dob)
      if (existingByKey.has(key)) {
        results.push({ row: excelRow, status: 'skipped', reasons: [`Student already exists (${existingByKey.get(key)})`], data: d })
        continue
      }
      if (seenInFile.has(key)) {
        results.push({ row: excelRow, status: 'skipped', reasons: [`Duplicate of row ${seenInFile.get(key)} in this file`], data: d })
        continue
      }
      // Mongoose validation dhab ah (Student schema + Enrollment hook) — wax lama keydiyo.
      try {
        const studentDoc = new Student({
          schoolId,
          studentCode: 'STU-PREVALIDATE',
          fullName: d.fullName,
          dob: d.dob,
          parentName: d.parentName,
          parentPhone: d.parentPhone,
          feeCategory: d.feeCategory,
          discountAmount: d.discountAmount,
        })
        await studentDoc.validate()
        await new Enrollment({
          schoolId,
          academicYearId: year._id,
          studentId: studentDoc._id,
          classId: d.klass._id,
          sectionId: d.section?._id,
        }).validate()
      } catch (err) {
        results.push({ row: excelRow, status: 'invalid', reasons: [err.message] })
        continue
      }
      seenInFile.set(key, excelRow)
      results.push({ row: excelRow, status: 'valid', data: d })
    }

    const valid = results.filter((r) => r.status === 'valid')
    const invalid = results.filter((r) => r.status === 'invalid')
    const skipped = results.filter((r) => r.status === 'skipped')
    const toImport = valid.slice(0, limit)

    for (const r of [...invalid, ...skipped].sort((a, b) => a.row - b.row)) {
      console.log(`Row ${r.row}  [${r.status.toUpperCase()}]`)
      for (const reason of r.reasons) console.log(`  ${reason}`)
    }
    if (invalid.length + skipped.length > 0) console.log('')

    const finish = (imported, failed, importedRows) => {
      const bar = '================================'
      console.log(bar)
      console.log(dryRun ? 'DRY RUN COMPLETE' : 'STUDENT IMPORT COMPLETE')
      console.log(bar)
      console.log(`Total rows:      ${String(results.length).padStart(5)}`)
      if (dryRun) {
        console.log(`Valid:           ${String(valid.length).padStart(5)}`)
        console.log(`Skipped:         ${String(skipped.length).padStart(5)}`)
        console.log(`Invalid:         ${String(invalid.length).padStart(5)}`)
        console.log('\nNo data was written to MongoDB.')
      } else {
        console.log(`Imported:        ${String(imported).padStart(5)}`)
        console.log(`Skipped:         ${String(skipped.length).padStart(5)}`)
        console.log(`Failed:          ${String(invalid.length + failed.length).padStart(5)}`)
        if (limit !== Infinity && valid.length > toImport.length) {
          console.log(`Not attempted:   ${String(valid.length - toImport.length).padStart(5)}  (--limit=${limit})`)
        }
      }
      console.log(`\nDatabase: ${dbName} @ ${dbHost}`)
      console.log(`School: ${school.name}`)
      console.log(`Academic Year: ${year.label}`)
      console.log(bar)
      for (const f of failed) console.log(`Row ${f.row} FAILED while writing: ${f.reason}`)

      if (opts.report) {
        const lines = ['row,status,studentCode,name,reason']
        for (const r of invalid) lines.push([r.row, 'failed', '', '', r.reasons.join(' | ')].map(csvCell).join(','))
        for (const r of skipped) lines.push([r.row, 'skipped', '', r.data.fullName, r.reasons.join(' | ')].map(csvCell).join(','))
        for (const f of failed) lines.push([f.row, 'failed', '', f.name, f.reason].map(csvCell).join(','))
        for (const i of importedRows) lines.push([i.row, 'imported', i.studentCode, i.name, ''].map(csvCell).join(','))
        fs.writeFileSync(opts.report, `${lines.join('\n')}\n`)
        console.log(`Report written: ${opts.report}`)
      }
      return invalid.length + failed.length > 0 ? 1 : 0
    }

    // 4) Dry run — halkan ayuu ku dhammaadaa
    if (dryRun) {
      const counter = await Counter.findById('studentCode').lean() // read-only
      const perClass = {}
      for (const r of valid) {
        const label = r.data.section ? `${r.data.klass.name} / ${r.data.section.name}` : r.data.klass.name
        perClass[label] = (perClass[label] || 0) + 1
      }
      console.log('Would be imported, by class:')
      for (const [label, n] of Object.entries(perClass).sort()) console.log(`  ${label}: ${n}`)
      console.log(`\nStudent IDs would continue after STU-${String(counter?.seq ?? 0).padStart(6, '0')} (assigned only at real import).\n`)
      return finish(0, [], [])
    }

    if (toImport.length === 0) {
      console.log('Nothing to import.\n')
      return finish(0, [], [])
    }

    // 5) Xaqiijin ka hor qorista production
    if (!flags.yes) {
      if (!process.stdin.isTTY) die('Refusing to write without confirmation in a non-interactive shell (use --yes).')
      const ans = await confirm(
        `About to CREATE ${toImport.length} student(s) in "${dbName}" for ${school.name} / ${year.label}.\nType IMPORT to continue: `
      )
      if (ans !== 'IMPORT') {
        console.log('Cancelled — nothing was written.')
        return 0
      }
    }

    // 6) Qor — safaf kasta si gooni ah; khalad hal saf ah ma joojiyo kuwa kale
    let imported = 0
    const failed = []
    const importedRows = []
    for (const [i, r] of toImport.entries()) {
      const d = r.data
      try {
        // Isla Student ID logic-ga controller-ka: Counter global + STU-000000
        const seq = await Counter.getNextSequence('studentCode')
        const studentCode = `STU-${String(seq).padStart(6, '0')}`
        const student = await Student.create({
          schoolId,
          studentCode,
          fullName: d.fullName,
          dob: d.dob,
          parentName: d.parentName,
          parentPhone: d.parentPhone,
          feeCategory: d.feeCategory,
          discountAmount: d.discountAmount,
        })
        try {
          await Enrollment.create({
            schoolId,
            academicYearId: year._id,
            studentId: student._id,
            classId: d.klass._id,
            sectionId: d.section?._id,
          })
        } catch (err) {
          await Student.deleteOne({ _id: student._id }) // kan oo uu hadda abuuray KALIYA (sida controller-ka)
          throw err
        }
        imported += 1
        importedRows.push({ row: r.row, studentCode, name: d.fullName })
        if (toImport.length <= 20) console.log(`Row ${r.row}: created ${studentCode}  ${d.fullName}  (${d.klass.name}${d.section ? ` / ${d.section.name}` : ''})`)
        else if ((i + 1) % 50 === 0) console.log(`  ...${i + 1}/${toImport.length}`)
      } catch (err) {
        failed.push({ row: r.row, name: d.fullName, reason: err.message })
      }
    }
    console.log('')
    return finish(imported, failed, importedRows)
  } finally {
    await mongoose.disconnect()
  }
}

module.exports = { normHeader, normName, cellToString, isEmptyRow, parseArgs, mapHeaders, parseDob, parseRow, studentKey }

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('\nImport aborted:', err.message)
      process.exit(1)
    })

}

