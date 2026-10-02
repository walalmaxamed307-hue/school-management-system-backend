const express = require('express')
const { list, mark, markAllPresent } = require('../controllers/attendanceController')
const { authenticate } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticate, asyncHandler(list))
router.post('/', authenticate, asyncHandler(mark))
router.post('/bulk-present', authenticate, asyncHandler(markAllPresent))
module.exports = router
