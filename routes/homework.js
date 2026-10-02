const express = require('express')
const { list, create, update, remove, mine } = require('../controllers/homeworkController')
const { authenticate, authenticateStudent, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

// Arday (student token): assignments-ka fasalkiisa.
router.get('/mine', authenticateStudent, asyncHandler(mine))

// Macalin (staff token, role teacher): CRUD assignments-kiisa.
router.get('/', authenticate, requireRole('teacher'), asyncHandler(list))
router.post('/', authenticate, requireRole('teacher'), asyncHandler(create))
router.put('/:id', authenticate, requireRole('teacher'), asyncHandler(update))
router.delete('/:id', authenticate, requireRole('teacher'), asyncHandler(remove))

module.exports = router
