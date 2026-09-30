const express = require('express')
const { stats } = require('../controllers/dashboardController')
const { authenticate } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/stats', authenticate, asyncHandler(stats))

module.exports = router
