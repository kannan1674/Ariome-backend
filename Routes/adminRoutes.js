const express = require('express');
const { listUsers, listTeachers, getDashboardStats } = require('../controller/adminController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.get('/stats', protect, authorize('admin'), getDashboardStats);
router.get('/users', listUsers);
router.get('/teachers', protect, authorize('admin'), listTeachers);

module.exports = router;
