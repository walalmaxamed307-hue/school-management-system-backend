const express = require('express')
const { pendingIncoming, accept, reject } = require('../controllers/studentTransferController')
const { authenticate, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/pending', authenticate, requireRole('admin'), asyncHandler(pendingIncoming))
router.post('/:id/accept', authenticate, requireRole('admin'), asyncHandler(accept))
router.post('/:id/reject', authenticate, requireRole('admin'), asyncHandler(reject))

module.exports = router
