const express = require('express')
const { directory } = require('../controllers/studentTransferController')
const { authenticate } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticate, asyncHandler(directory))

module.exports = router
