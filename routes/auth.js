const express = require('express')
const { login, studentLogin, setStudentPin, me, changePassword } = require('../controllers/authController')
const { authenticateStaffOrOwner, authenticateSession } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')
const { loginLimiter, changePasswordLimiter } = require('../middleware/security')

const router = express.Router()

router.post('/login', loginLimiter, asyncHandler(login))
router.post('/student-login', loginLimiter, asyncHandler(studentLogin))
// authenticateSession wuxuu aqbalaa setup token-ka; controller-ku wuxuu si
// cad u xaqiijiyaa scope=student_pin_setup. Student endpoints-ka kale weli
// authenticateStudent ayay isticmaalaan oo setup token ma geli karo.
router.post('/student-pin', authenticateSession, asyncHandler(setStudentPin))
router.get('/me', authenticateSession, asyncHandler(me))
// Admin/macalin/owner (token-ka ardayga iyo platform-ka waa la diidaa).
router.post('/change-password', authenticateStaffOrOwner, changePasswordLimiter, asyncHandler(changePassword))

module.exports = router
