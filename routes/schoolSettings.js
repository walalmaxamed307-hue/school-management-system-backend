const express = require('express')
const { getSettings, updateSettings, uploadLogo, removeLogo } = require('../controllers/schoolSettingsController')
const { authenticate, authenticateSession, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')
const { singleFile } = require('../middleware/upload')
const { LOGO_MAX_BYTES } = require('../services/fileRules')

const router = express.Router()

// Ardayga wuxuu arkaa keliya magaca/logo/contact-ka iskuulkiisa (schoolId-ka
// token-kiisa), si StudentLayout u isticmaalo isla branding-ka saxda ah.
router.get('/', authenticateSession, asyncHandler(getSettings))
router.patch('/', authenticate, requireRole('admin'), asyncHandler(updateSettings))
router.post('/logo', authenticate, requireRole('admin'), singleFile('file', LOGO_MAX_BYTES), asyncHandler(uploadLogo))
router.delete('/logo', authenticate, requireRole('admin'), asyncHandler(removeLogo))

module.exports = router
