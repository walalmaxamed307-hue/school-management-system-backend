const express = require('express')
const { list, mark } = require('../controllers/teacherAttendanceController')
const { authenticate, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticate, requireRole('admin'), asyncHandler(list))
router.post('/', authenticate, requireRole('admin'), asyncHandler(mark))

module.exports = router
