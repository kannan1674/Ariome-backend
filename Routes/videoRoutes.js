const express = require('express');
const {
    listVideos,
    uploadVideo,
    updateVideo,
    deleteVideo,
    recordView,
    retryTranscription,
} = require('../controller/videoController');
const {
    getEngagement,
    toggleLike,
    addComment,
    listTeacherFeedback,
    recordWatchTime,
} = require('../controller/videoEngagementController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { handleUpload, handleUpdate } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.get('/mine/feedback', protect, authorize('teacher', 'admin'), listTeacherFeedback);
router.get('/', protect, listVideos);
router.post('/upload', protect, authorize('teacher', 'admin'), handleUpload, uploadVideo);
router.get('/:id/engagement', protect, getEngagement);
router.post('/:id/like', protect, toggleLike);
router.post('/:id/comments', protect, addComment);
router.post('/:id/view', protect, recordView);
router.post('/:id/watch-time', protect, recordWatchTime);
router.post(
    '/:id/transcribe',
    protect,
    authorize('teacher', 'admin'),
    retryTranscription,
);
router.patch('/:id', protect, authorize('teacher', 'admin'), handleUpdate, updateVideo);
router.delete('/:id', protect, authorize('teacher', 'admin'), deleteVideo);

module.exports = router;
