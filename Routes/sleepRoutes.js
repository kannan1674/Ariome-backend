const express = require('express');
const { postRecommendations } = require('../controller/sleepController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/recommend', protect, postRecommendations);

module.exports = router;
