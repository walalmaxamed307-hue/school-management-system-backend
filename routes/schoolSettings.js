const express = require('express')
const { getSettings, updateSettings } = require('../controllers/schoolSettingsController')
const { authenticate, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticate, asyncHandler(getSettings))
router.patch('/', authenticate, requireRole('admin'), asyncHandler(updateSettings))

module.exports = router
