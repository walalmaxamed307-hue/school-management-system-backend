const express = require('express')
const { stats } = require('../controllers/dashboardController')
const { authenticate, requireRole } = require('../middleware/auth')
const { riskStudents } = require('../controllers/riskStudentsController')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/stats', authenticate, asyncHandler(stats))
// Admin kaliya — wuxuu muujiyaa fees + natiijo ardayda.
router.get('/risk-students', authenticate, requireRole('admin'), asyncHandler(riskStudents))

module.exports = router
