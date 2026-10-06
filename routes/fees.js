const express = require('express')
const { list, upsert } = require('../controllers/feeController')
const { authenticate, requireFeeAccess } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

// Admin ama macalin fee manager ah.
router.get('/', authenticate, requireFeeAccess, asyncHandler(list))
router.post('/', authenticate, requireFeeAccess, asyncHandler(upsert))

module.exports = router
