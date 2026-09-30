const express = require('express')
const {
  list,
  create,
  update,
  remove,
  enableSections,
  addSection,
  removeSection,
  bulkAssignSection,
} = require('../controllers/classController')
const { authenticate, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticate, asyncHandler(list))
router.post('/', authenticate, requireRole('admin'), asyncHandler(create))
router.patch('/:id', authenticate, requireRole('admin'), asyncHandler(update))
router.delete('/:id', authenticate, requireRole('admin'), asyncHandler(remove))

router.patch('/:id/enable-sections', authenticate, requireRole('admin'), asyncHandler(enableSections))
router.post('/:id/sections', authenticate, requireRole('admin'), asyncHandler(addSection))
router.delete('/:id/sections/:sectionId', authenticate, requireRole('admin'), asyncHandler(removeSection))
router.post('/:id/bulk-assign-section', authenticate, requireRole('admin'), asyncHandler(bulkAssignSection))

module.exports = router
