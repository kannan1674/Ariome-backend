const authModel = require('../models/authModel');
const Video = require('../models/videoModel');
const { sendServerError } = require('../utils/apiError');

function userPublicJSON(user) {
    const displayName = user.profile?.displayName?.trim();
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: displayName || fullName || 'User',
        email: user.email || null,
        phone: user.phone,
        role: user.role || 'user',
        emailVerified: Boolean(user.emailVerified),
        createdAt: user.createdAt,
    };
}

const listUsers = async (req, res) => {
    try {
        const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
        const users = await authModel
            .find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('firstName lastName email phone profile role emailVerified createdAt')
            .lean();

        return res.json({
            users: users.map(userPublicJSON),
        });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to list users', err);
    }
};

/** @deprecated Use listUsers — kept for older clients */
const listTeachers = async (req, res) => {
    try {
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
        const teachers = await authModel
            .find({ role: 'teacher' })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('firstName lastName email phone profile role emailVerified createdAt')
            .lean();

        return res.json({
            teachers: teachers.map(userPublicJSON),
        });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to list teachers', err);
    }
};

const getDashboardStats = async (req, res) => {
    try {
        const [totalUsers, totalTeachers, totalVideos, viewsAgg, watchAgg, topVideos] = await Promise.all([
            authModel.countDocuments(),
            authModel.countDocuments({ role: 'teacher' }),
            Video.countDocuments(),
            Video.aggregate([
                { $group: { _id: null, totalViews: { $sum: { $ifNull: ['$viewCount', 0] } } } },
            ]),
            Video.aggregate([
                {
                    $group: {
                        _id: null,
                        totalWatchTimeSeconds: { $sum: { $ifNull: ['$watchTimeSeconds', 0] } },
                    },
                },
            ]),
            Video.find()
                .sort({ viewCount: -1, createdAt: -1 })
                .limit(20)
                .select('title teacherName viewCount watchTimeSeconds thumbnailFilename createdAt')
                .lean(),
        ]);

        const totalViews = viewsAgg[0]?.totalViews ?? 0;
        const totalWatchTimeSeconds = watchAgg[0]?.totalWatchTimeSeconds ?? 0;

        return res.json({
            stats: {
                totalUsers,
                totalTeachers,
                totalVideos,
                totalViews,
                totalWatchTimeSeconds,
            },
            videos: topVideos.map((v) => ({
                id: v._id,
                title: v.title,
                teacherName: v.teacherName || 'Teacher',
                viewCount: v.viewCount ?? 0,
                watchTimeSeconds: v.watchTimeSeconds ?? 0,
                thumbnailUrl: v.thumbnailFilename
                    ? `${req.protocol}://${req.get('host')}/uploads/thumbnails/${v.thumbnailFilename}`
                    : null,
                createdAt: v.createdAt,
            })),
        });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to load dashboard stats', err);
    }
};

module.exports = {
    listUsers,
    listTeachers,
    getDashboardStats,
};
