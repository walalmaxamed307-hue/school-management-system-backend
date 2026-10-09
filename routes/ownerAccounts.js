const express = require('express')
const { list, create, update, remove } = require('../controllers/ownerAccountController')
const { authenticate, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

// Admin kaliya: abuur / liis / reset password / joojin / tirtir akoonnada owner-ka.
router.get('/', authenticate, requireRole('admin'), asyncHandler(list))
router.post('/', authenticate, requireRole('admin'), asyncHandler(create))
router.patch('/:id', authenticate, requireRole('admin'), asyncHandler(update))
router.delete('/:id', authenticate, requireRole('admin'), asyncHandler(remove))

module.exports = router
