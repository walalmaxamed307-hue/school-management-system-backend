const express = require('express')
const { list, create, update, remove } = require('../controllers/subjectController')
const { authenticate, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticate, asyncHandler(list))
router.post('/', authenticate, requireRole('admin'), asyncHandler(create))
router.patch('/:id', authenticate, requireRole('admin'), asyncHandler(update))
router.delete('/:id', authenticate, requireRole('admin'), asyncHandler(remove))

module.exports = router
