const express = require('express');
const {
    postAiClips,
    postReflectionCard,
    postJournalPrompts,
    postShortsGenerate,
    postShortVideoVoice,
} = require('../controller/contentController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/ai-clips', protect, postAiClips);
router.post('/reflection-card', protect, postReflectionCard);
router.post('/journal-prompts', protect, postJournalPrompts);
router.post('/shorts', protect, postShortsGenerate);
router.post('/short-video-voice', protect, postShortVideoVoice);

module.exports = router;
