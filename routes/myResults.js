const express = require('express')
const { myResults } = require('../controllers/myResultsController')
const { authenticateStudent } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticateStudent, asyncHandler(myResults))

module.exports = router
