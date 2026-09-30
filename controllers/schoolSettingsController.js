const { SchoolSettings, AcademicYear } = require('../models')

async function getSettings(req, res) {
  const settings = await SchoolSettings.findOne({ schoolId: req.user.schoolId })
  if (!settings) return res.status(404).json({ error: 'SchoolSettings not found for this school' })
  res.json(settings)
}

// currentAcademicYearId is deliberately NOT patchable here — that pointer
// only moves as a side effect of creating/closing an AcademicYear (see
// academicYearController), never as a direct admin edit, so it can't drift
// from the actual historical record.
const PATCHABLE_FIELDS = [
  'name',
  'phone',
  'address',
  'logoUrl',
  'defaultExamMaxMark',
  'defaultPassMark',
  'defaultStandardFeeAmount',
]

const NUMERIC_FIELDS = ['defaultExamMaxMark', 'defaultPassMark', 'defaultStandardFeeAmount']

async function updateSettings(req, res) {
  const updates = {}
  for (const field of PATCHABLE_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field]
  }

  // Tirooyinka waa in ay noqdaan tiro sax ah, ma-liita (ha noqon NaN/negative).
  for (const field of NUMERIC_FIELDS) {
    if (updates[field] !== undefined) {
      const n = Number(updates[field])
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: `${field} must be a number >= 0` })
      }
      updates[field] = n
    }
  }
  if (updates.defaultExamMaxMark !== undefined && updates.defaultExamMaxMark <= 0) {
    return res.status(400).json({ error: 'defaultExamMaxMark must be greater than 0' })
  }
  if (updates.name !== undefined && !String(updates.name).trim()) {
    return res.status(400).json({ error: 'name must not be empty' })
  }

  const settings = await SchoolSettings.findOneAndUpdate(
    { schoolId: req.user.schoolId },
    updates,
    { new: true, runValidators: true }
  )
  if (!settings) return res.status(404).json({ error: 'SchoolSettings not found for this school' })

  // Promotion-ku wuxuu isticmaalaa AcademicYear.passMarkSnapshot (ma aha
  // settings-ka toos ah). Haddii aan halkan la cusboonaysiin, admin-ku wuu
  // beddeli lahaa pass mark-ga Settings laakiin promotion-ku wuu isticmaali lahaa
  // qiimihii hore. Kaliya sanadka ACTIVE ah ayaa la cusboonaysiiyaa — sanadihii
  // xidhmay (closed) waa la ilaaliyaa.
  if (updates.defaultPassMark !== undefined) {
    await AcademicYear.updateOne(
      { schoolId: req.user.schoolId, status: 'active' },
      { passMarkSnapshot: updates.defaultPassMark }
    )
  }

  res.json(settings)
}

module.exports = { getSettings, updateSettings }
