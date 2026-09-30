const express = require('express')
const { login, studentLogin, me, changePassword } = require('../controllers/authController')
const { authenticate, authenticateSession } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')
const { loginLimiter, changePasswordLimiter } = require('../middleware/security')

const router = express.Router()

router.post('/login', loginLimiter, asyncHandler(login))
router.post('/student-login', loginLimiter, asyncHandler(studentLogin))
router.get('/me', authenticateSession, asyncHandler(me))
router.post('/change-password', authenticate, changePasswordLimiter, asyncHandler(changePassword))

module.exports = router
