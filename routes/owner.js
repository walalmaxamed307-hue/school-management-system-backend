const express = require('express')
const { overview } = require('../controllers/ownerController')
const { authenticateOwner } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

// Owner kaliya (token-ka owner + DB check: isActive, iskuulka firfircoon).
router.get('/overview', authenticateOwner, asyncHandler(overview))

module.exports = router
