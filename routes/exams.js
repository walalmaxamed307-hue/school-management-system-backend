const express = require('express')
const { list, create, remove } = require('../controllers/examController')
const { getResults, putMark, publish } = require('../controllers/examResultController')
const { split, getSplit, update } = require('../controllers/roomSplitController')
const { authenticate, requireRole } = require('../middleware/auth')
const asyncHandler = require('../middleware/asyncHandler')

const router = express.Router()

router.get('/', authenticate, asyncHandler(list))
router.post('/', authenticate, requireRole('admin'), asyncHandler(create))
router.delete('/:id', authenticate, requireRole('admin'), asyncHandler(remove))

router.get('/:id/results', authenticate, asyncHandler(getResults))
router.put('/:id/results', authenticate, asyncHandler(putMark))
router.post('/:id/publish', authenticate, asyncHandler(publish))

router.post('/:id/room-split', authenticate, requireRole('admin'), asyncHandler(split))
router.get('/:id/room-split', authenticate, asyncHandler(getSplit))
router.patch('/:id/room-split/:enrollmentId', authenticate, requireRole('admin'), asyncHandler(update))

module.exports = router
