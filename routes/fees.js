const express = require('express')
const { list, upsert } = require('../controllers/feeController')
const { authenticate, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticate, requireRole('admin'), asyncHandler(list))
router.post('/', authenticate, requireRole('admin'), asyncHandler(upsert))

module.exports = router
