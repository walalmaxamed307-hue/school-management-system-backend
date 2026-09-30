const express = require('express')
const { list, create, close } = require('../controllers/academicYearController')
const { authenticate, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticate, asyncHandler(list))
router.post('/', authenticate, requireRole('admin'), asyncHandler(create))
router.patch('/:id/close', authenticate, requireRole('admin'), asyncHandler(close))

module.exports = router
