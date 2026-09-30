const express = require('express')
const { list, create, remove } = require('../controllers/announcementController')
const { authenticate, authenticateSession, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticateSession, asyncHandler(list))
router.post('/', authenticate, asyncHandler(create))
router.delete('/:id', authenticate, requireRole('admin'), asyncHandler(remove))

module.exports = router
