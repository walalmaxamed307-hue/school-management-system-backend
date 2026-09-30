const express = require('express')
const { myRoom } = require('../controllers/myResultsController')
const { authenticateStudent } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticateStudent, asyncHandler(myRoom))

module.exports = router
