const express = require('express')
const { listMine, downloadMine } = require('../controllers/assignmentController')
const { authenticateStudent } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')
const router = express.Router()
router.get('/', authenticateStudent, asyncHandler(listMine))
router.get('/:id/download', authenticateStudent, asyncHandler(downloadMine))
module.exports = router
