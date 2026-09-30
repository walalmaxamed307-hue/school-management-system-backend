const express = require('express')
const { run } = require('../controllers/promotionController')
const { authenticate, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.post('/run', authenticate, requireRole('admin'), asyncHandler(run))

module.exports = router
