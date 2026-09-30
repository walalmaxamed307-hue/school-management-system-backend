const express = require('express')
const { login } = require('../controllers/platformAuthController')
const { list, create, update } = require('../controllers/platformSchoolController')
const { authenticatePlatform } = require('../middleware/platformAuth')
const asyncHandler = require('../middleware/asyncHandler')
const { loginLimiter } = require('../middleware/security')

const router = express.Router()

router.post('/auth/login', loginLimiter, asyncHandler(login))
router.get('/schools', authenticatePlatform, asyncHandler(list))
router.post('/schools', authenticatePlatform, asyncHandler(create))
router.patch('/schools/:id', authenticatePlatform, asyncHandler(update))

module.exports = router
