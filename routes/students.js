const express = require('express')
const { list, create, update, remove, graduates } = require('../controllers/studentController')
const { studentAbsenceCount } = require('../controllers/attendanceController')
const { transfer } = require('../controllers/studentTransferController')
const { authenticate, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticate, asyncHandler(list))
router.get('/graduates', authenticate, asyncHandler(graduates))
router.post('/', authenticate, requireRole('admin'), asyncHandler(create))
router.patch('/:id', authenticate, requireRole('admin'), asyncHandler(update))
router.delete('/:id', authenticate, requireRole('admin'), asyncHandler(remove))
router.get('/:id/absences', authenticate, asyncHandler(studentAbsenceCount))
router.post('/:id/transfer', authenticate, requireRole('admin'), asyncHandler(transfer))

module.exports = router
