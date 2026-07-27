const express = require('express');
const { postTranslate, postTranslateBatch } = require('../controller/translationController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', protect, postTranslate);
router.post('/batch', protect, postTranslateBatch);

module.exports = router;
