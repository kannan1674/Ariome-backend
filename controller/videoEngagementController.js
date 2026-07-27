const Video = require('../models/videoModel');
const VideoLike = require('../models/videoLikeModel');
const VideoComment = require('../models/videoCommentModel');
const { sendServerError } = require('../utils/apiError');

function displayName(user) {
    const fromProfile = user.profile?.displayName?.trim();
    if (fromProfile) return fromProfile;
    const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return full || 'User';
}

function commentPublicJSON(doc) {
    return {
        id: doc._id,
        videoId: doc.video,
        authorName: doc.authorName,
        text: doc.text,
        createdAt: doc.createdAt,
    };
}

async function findVideoOr404(id, res) {
    const video = await Video.findById(id).select('_id uploadedBy title');
    if (!video) {
        res.status(404).json({ message: 'Video not found' });
        return null;
    }
    return video;
}

const getEngagement = async (req, res) => {
    try {
        const video = await findVideoOr404(req.params.id, res);
        if (!video) return;

        const [likeCount, likedByMe, comments] = await Promise.all([
            VideoLike.countDocuments({ video: video._id }),
            VideoLike.exists({ video: video._id, user: req.userId }),
            VideoComment.find({ video: video._id })
                .sort({ createdAt: -1 })
                .limit(50)
                .select('authorName text createdAt video')
                .lean(),
        ]);

        return res.json({
            likeCount,
            likedByMe: Boolean(likedByMe),
            comments: comments.map(commentPublicJSON),
        });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to load engagement', err);
    }
};

const toggleLike = async (req, res) => {
    try {
        const video = await findVideoOr404(req.params.id, res);
        if (!video) return;

        const existing = await VideoLike.findOne({ video: video._id, user: req.userId });
        if (existing) {
            await VideoLike.deleteOne({ _id: existing._id });
            const likeCount = await VideoLike.countDocuments({ video: video._id });
            return res.json({ liked: false, likeCount, message: 'Like removed' });
        }

        await VideoLike.create({ video: video._id, user: req.userId });
        const likeCount = await VideoLike.countDocuments({ video: video._id });
        return res.json({ liked: true, likeCount, message: 'Liked' });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to toggle like', err);
    }
};

const addComment = async (req, res) => {
    try {
        const video = await findVideoOr404(req.params.id, res);
        if (!video) return;

        const text = String(req.body.text || '').trim();
        if (!text) {
            return res.status(400).json({ message: 'Comment text is required' });
        }
        if (text.length > 1000) {
            return res.status(400).json({ message: 'Comment must be 1000 characters or less' });
        }

        const comment = await VideoComment.create({
            video: video._id,
            user: req.userId,
            authorName: displayName(req.user),
            text,
        });

        const likeCount = await VideoLike.countDocuments({ video: video._id });

        return res.status(201).json({
            message: 'Comment added',
            comment: commentPublicJSON(comment),
            likeCount,
        });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to add comment', err);
    }
};

const listTeacherFeedback = async (req, res) => {
    try {
        const videos = await Video.find({ uploadedBy: req.userId }).select('_id title').lean();
        if (!videos.length) {
            return res.json({
                feedback: [],
                totals: { comments: 0, likes: 0, watchTimeSeconds: 0 },
            });
        }

        const videoIds = videos.map((v) => v._id);
        const titleById = new Map(videos.map((v) => [String(v._id), v.title]));

        const [comments, likeCounts] = await Promise.all([
            VideoComment.find({ video: { $in: videoIds } })
                .sort({ createdAt: -1 })
                .limit(200)
                .select('video authorName text createdAt')
                .lean(),
            VideoLike.aggregate([
                { $match: { video: { $in: videoIds } } },
                { $group: { _id: '$video', count: { $sum: 1 } } },
            ]),
        ]);

        const likesByVideo = new Map(likeCounts.map((row) => [String(row._id), row.count]));

        const feedback = comments.map((c) => ({
            id: c._id,
            videoId: c.video,
            videoTitle: titleById.get(String(c.video)) || 'Video',
            authorName: c.authorName,
            text: c.text,
            createdAt: c.createdAt,
        }));

        const videoDetails = await Video.find({ _id: { $in: videoIds } })
            .select('watchTimeSeconds viewCount')
            .lean();
        const watchByVideo = new Map(
            videoDetails.map((v) => [String(v._id), v.watchTimeSeconds ?? 0]),
        );
        const viewsByVideo = new Map(
            videoDetails.map((v) => [String(v._id), v.viewCount ?? 0]),
        );

        const totals = {
            comments: comments.length,
            likes: likeCounts.reduce((sum, row) => sum + row.count, 0),
            watchTimeSeconds: videoDetails.reduce((sum, v) => sum + (v.watchTimeSeconds ?? 0), 0),
        };

        const perVideo = videos.map((v) => ({
            videoId: v._id,
            title: v.title,
            likeCount: likesByVideo.get(String(v._id)) || 0,
            commentCount: comments.filter((c) => String(c.video) === String(v._id)).length,
            watchTimeSeconds: watchByVideo.get(String(v._id)) || 0,
            viewCount: viewsByVideo.get(String(v._id)) || 0,
        }));

        return res.json({ feedback, totals, perVideo });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to load feedback', err);
    }
};

const recordWatchTime = async (req, res) => {
    try {
        const video = await findVideoOr404(req.params.id, res);
        if (!video) return;

        const raw = Number(req.body.seconds);
        if (!Number.isFinite(raw) || raw <= 0) {
            return res.status(400).json({ message: 'seconds must be a positive number' });
        }

        const seconds = Math.min(120, Math.max(1, Math.round(raw)));

        const updated = await Video.findByIdAndUpdate(
            video._id,
            { $inc: { watchTimeSeconds: seconds } },
            { new: true },
        ).select('watchTimeSeconds viewCount title');

        return res.json({
            message: 'Watch time recorded',
            watchTimeSeconds: updated?.watchTimeSeconds ?? 0,
            secondsAdded: seconds,
        });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to record watch time', err);
    }
};

module.exports = {
    getEngagement,
    toggleLike,
    addComment,
    listTeacherFeedback,
    recordWatchTime,
};
