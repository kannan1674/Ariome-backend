const path = require('path');
const fs = require('fs');
const Video = require('../models/videoModel');
const { translateFields } = require('../utils/translationService');
const VideoLike = require('../models/videoLikeModel');
const VideoComment = require('../models/videoCommentModel');
const { sendServerError } = require('../utils/apiError');
const { UPLOAD_DIR, THUMBNAIL_DIR } = require('../middleware/uploadMiddleware');
const {
    writeSubtitleFiles,
    buildSubtitleTracks,
    deleteSubtitleFiles,
    SUBTITLE_DIR,
} = require('../utils/subtitleVtt');
const { scheduleHlsTranscode, deleteHlsOutput } = require('../utils/hlsTranscode');
const { scheduleVideoTranscription } = require('../utils/transcribeVideo');

function buildVideoUrl(req, filename) {
    const base = `${req.protocol}://${req.get('host')}`;
    return `${base}/uploads/videos/${filename}`;
}

function buildThumbnailUrl(req, filename) {
    if (!filename) return null;
    const base = `${req.protocol}://${req.get('host')}`;
    return `${base}/uploads/thumbnails/${filename}`;
}

function buildHlsUrl(req, hlsManifest) {
    if (!hlsManifest) return null;
    const base = `${req.protocol}://${req.get('host')}`;
    return `${base}/uploads/hls/${hlsManifest}`;
}

const ALLOWED_MOODS = ['Peaceful', 'Grateful', 'Hopeful', 'Joyful', 'Reflective', 'Anxious'];

function parseMood(value) {
    const mood = String(value || 'Peaceful').trim();
    return ALLOWED_MOODS.includes(mood) ? mood : 'Peaceful';
}

function parseSection(value) {
    return value === 'practices' ? 'practices' : 'wisdom';
}

function parseDurationSeconds(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 24 * 60 * 60);
}

function canManageVideo(video, userId, role) {
    const isOwner = String(video.uploadedBy) === String(userId);
    return isOwner || role === 'admin';
}

function unlinkFile(dir, filename) {
    if (!filename) return;
    fs.unlink(path.join(dir, filename), () => {});
}

function cleanupUploadFiles(videoFile, thumbFile) {
    if (videoFile?.filename) unlinkFile(UPLOAD_DIR, videoFile.filename);
    if (thumbFile?.filename) unlinkFile(THUMBNAIL_DIR, thumbFile.filename);
}

const SUPPORTED_LOCALES = new Set(['en', 'es', 'fr', 'hi', 'ta']);

function normalizeLocale(value) {
    const base = String(value || 'en')
        .split('-')[0]
        .toLowerCase();
    return SUPPORTED_LOCALES.has(base) ? base : 'en';
}

function resolveLocalizedVideo(doc, locale) {
    const sourceLocale = doc.sourceLocale || 'en';
    const target = normalizeLocale(locale);
    if (target === sourceLocale) {
        return {
            title: doc.title,
            description: doc.description,
            localized: false,
            sourceLocale,
            displayLocale: target,
        };
    }
    const entry = doc.translations?.get?.(target) || doc.translations?.[target];
    if (entry?.title) {
        return {
            title: entry.title,
            description: entry.description || doc.description,
            localized: true,
            sourceLocale,
            displayLocale: target,
            translationProvider: entry.provider || 'stored',
        };
    }
    return {
        title: doc.title,
        description: doc.description,
        localized: false,
        sourceLocale,
        displayLocale: target,
        needsTranslation: true,
    };
}

async function ensureVideoTranslation(doc, locale) {
    const target = normalizeLocale(locale);
    const sourceLocale = doc.sourceLocale || 'en';
    if (target === sourceLocale) return null;

    const existing = doc.translations?.get?.(target) || doc.translations?.[target];
    if (existing?.title) return existing;

    const translated = await translateFields(
        doc.title,
        doc.description || '',
        sourceLocale,
        target,
    );

    await Video.updateOne(
        { _id: doc._id },
        {
            $set: {
                [`translations.${target}`]: {
                    title: translated.title,
                    description: translated.description,
                    provider: translated.provider,
                    updatedAt: new Date(),
                },
            },
        },
    );

    const refreshed = await Video.findById(doc._id).lean();
    if (refreshed) {
        try {
            writeSubtitleFiles(refreshed);
        } catch {
            /* non-fatal */
        }
    }

    return translated;
}

function videoPublicJSON(doc, req, likeCount = 0, locale = 'en') {
    const localized = resolveLocalizedVideo(doc, locale);
    return {
        id: doc._id,
        title: localized.title,
        description: localized.description,
        localized: localized.localized,
        sourceLocale: localized.sourceLocale,
        displayLocale: localized.displayLocale,
        translationProvider: localized.translationProvider,
        needsTranslation: localized.needsTranslation,
        mood: doc.mood,
        section: doc.section,
        videoUrl: buildVideoUrl(req, doc.filename),
        hlsUrl: buildHlsUrl(req, doc.hlsManifest),
        playbackUrl:
            doc.transcodeStatus === 'ready' && doc.hlsManifest
                ? buildHlsUrl(req, doc.hlsManifest)
                : buildVideoUrl(req, doc.filename),
        subtitleTracks: buildSubtitleTracks(doc, req),
        transcodeStatus: doc.transcodeStatus || 'pending',
        transcribeStatus: doc.transcribeStatus || 'pending',
        transcribeError:
            doc.transcribeError ||
            (doc.transcribeStatus === 'failed'
                ? 'Speech captions could not be generated. Ask your teacher to retry from My videos.'
                : ''),
        thumbnailUrl: buildThumbnailUrl(req, doc.thumbnailFilename),
        mimeType: doc.mimeType,
        size: doc.size,
        durationSeconds: doc.durationSeconds ?? 0,
        teacherName: doc.teacherName,
        viewCount: doc.viewCount ?? 0,
        watchTimeSeconds: doc.watchTimeSeconds ?? 0,
        likeCount,
        uploadedBy: doc.uploadedBy,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        source: 'upload',
    };
}

const listVideos = async (req, res) => {
    try {
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const locale = normalizeLocale(
            req.query.locale || req.headers['accept-language']?.split(',')[0],
        );
        const autoTranslate = req.query.autoTranslate !== 'false';
        const filter = {};
        if (req.query.mine === 'true') {
            filter.uploadedBy = req.userId;
        }
        const videos = await Video.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('-__v')
            .lean();

        if (autoTranslate && locale !== 'en') {
            await Promise.all(
                videos
                    .filter((v) => {
                        const source = v.sourceLocale || 'en';
                        if (source === locale) return false;
                        const entry = v.translations?.[locale];
                        return !entry?.title;
                    })
                    .slice(0, 8)
                    .map((v) => ensureVideoTranslation(v, locale).catch(() => null)),
            );
            const refreshed = await Video.find({ _id: { $in: videos.map((v) => v._id) } })
                .select('-__v')
                .lean();
            videos.splice(0, videos.length, ...refreshed);
        }

        for (const v of videos) {
            const subtitleProbe = path.join(SUBTITLE_DIR, `${v._id}-en.vtt`);
            if (!fs.existsSync(subtitleProbe)) {
                try {
                    writeSubtitleFiles(v);
                } catch {
                    /* non-fatal */
                }
            }
            if (v.transcodeStatus === 'pending' && v.filename) {
                scheduleHlsTranscode(v._id, path.join(UPLOAD_DIR, v.filename));
            }
            if (v.filename) {
                scheduleVideoTranscription(
                    v._id,
                    path.join(UPLOAD_DIR, v.filename),
                    v.sourceLocale || 'en',
                );
            }
        }

        const videoIds = videos.map((v) => v._id);
        let likesByVideo = new Map();
        if (videoIds.length > 0) {
            const likeCounts = await VideoLike.aggregate([
                { $match: { video: { $in: videoIds } } },
                { $group: { _id: '$video', count: { $sum: 1 } } },
            ]);
            likesByVideo = new Map(likeCounts.map((row) => [String(row._id), row.count]));
        }

        res.set('Cache-Control', 'private, max-age=15');
        return res.json({
            locale,
            videos: videos.map((v) =>
                videoPublicJSON(v, req, likesByVideo.get(String(v._id)) || 0, locale),
            ),
        });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to list videos', err);
    }
};

const uploadVideo = async (req, res) => {
    const videoFile = req.files?.video?.[0];
    const thumbFile = req.files?.thumbnail?.[0];

    try {
        if (!videoFile) {
            cleanupUploadFiles(null, thumbFile);
            return res.status(400).json({ message: 'Video file is required (field name: video)' });
        }

        if (!thumbFile) {
            cleanupUploadFiles(videoFile, null);
            return res.status(400).json({ message: 'Thumbnail image is required (field name: thumbnail)' });
        }

        const title = String(req.body.title || '').trim();
        if (!title) {
            cleanupUploadFiles(videoFile, thumbFile);
            return res.status(400).json({ message: 'Title is required' });
        }

        const mood = parseMood(req.body.mood);
        const section = parseSection(req.body.section);

        const teacherName = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ').trim();

        const video = await Video.create({
            title,
            description: String(req.body.description || '').trim(),
            mood,
            section,
            filename: videoFile.filename,
            thumbnailFilename: thumbFile.filename,
            originalName: videoFile.originalname,
            mimeType: videoFile.mimetype,
            size: videoFile.size,
            durationSeconds: parseDurationSeconds(req.body.durationSeconds),
            uploadedBy: req.userId,
            teacherName: teacherName || 'Teacher',
            transcodeStatus: 'pending',
        });

        scheduleHlsTranscode(video._id, path.join(UPLOAD_DIR, videoFile.filename));
        scheduleVideoTranscription(
            video._id,
            path.join(UPLOAD_DIR, videoFile.filename),
            video.sourceLocale || 'en',
        );

        return res.status(201).json({
            message: 'Video uploaded successfully',
            video: videoPublicJSON(video, req),
        });
    } catch (err) {
        cleanupUploadFiles(videoFile, thumbFile);
        return sendServerError(res, 500, 'Video upload failed', err);
    }
};

const updateVideo = async (req, res) => {
    const thumbFile = req.files?.thumbnail?.[0];

    try {
        const video = await Video.findById(req.params.id);
        if (!video) {
            if (thumbFile?.filename) unlinkFile(THUMBNAIL_DIR, thumbFile.filename);
            return res.status(404).json({ message: 'Video not found' });
        }

        if (!canManageVideo(video, req.userId, req.user.role)) {
            if (thumbFile?.filename) unlinkFile(THUMBNAIL_DIR, thumbFile.filename);
            return res.status(403).json({ message: 'You can only edit your own videos' });
        }

        const title = String(req.body.title || '').trim();
        if (!title) {
            if (thumbFile?.filename) unlinkFile(THUMBNAIL_DIR, thumbFile.filename);
            return res.status(400).json({ message: 'Title is required' });
        }

        video.title = title;
        video.description = String(req.body.description || '').trim();
        video.mood = parseMood(req.body.mood);
        video.section = parseSection(req.body.section);

        if (thumbFile) {
            if (video.thumbnailFilename) {
                unlinkFile(THUMBNAIL_DIR, video.thumbnailFilename);
            }
            video.thumbnailFilename = thumbFile.filename;
        }

        await video.save();

        try {
            writeSubtitleFiles(video);
        } catch {
            /* non-fatal */
        }

        return res.json({
            message: 'Video updated successfully',
            video: videoPublicJSON(video, req),
        });
    } catch (err) {
        if (thumbFile?.filename) unlinkFile(THUMBNAIL_DIR, thumbFile.filename);
        return sendServerError(res, 500, 'Update video failed', err);
    }
};

const recordView = async (req, res) => {
    try {
        const video = await Video.findByIdAndUpdate(
            req.params.id,
            { $inc: { viewCount: 1 } },
            { new: true },
        ).select('viewCount title');

        if (!video) {
            return res.status(404).json({ message: 'Video not found' });
        }

        return res.json({
            message: 'View recorded',
            viewCount: video.viewCount,
        });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to record view', err);
    }
};

const deleteVideo = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) {
            return res.status(404).json({ message: 'Video not found' });
        }

        if (!canManageVideo(video, req.userId, req.user.role)) {
            return res.status(403).json({ message: 'You can only delete your own videos' });
        }

        await Promise.all([
            Video.deleteOne({ _id: video._id }),
            VideoLike.deleteMany({ video: video._id }),
            VideoComment.deleteMany({ video: video._id }),
        ]);
        unlinkFile(UPLOAD_DIR, video.filename);
        unlinkFile(THUMBNAIL_DIR, video.thumbnailFilename);
        deleteSubtitleFiles(video._id);
        deleteHlsOutput(video._id);

        return res.json({ message: 'Video deleted' });
    } catch (err) {
        return sendServerError(res, 500, 'Delete video failed', err);
    }
};

const retryTranscription = async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) {
            return res.status(404).json({ message: 'Video not found' });
        }

        if (!canManageVideo(video, req.userId, req.user.role)) {
            return res.status(403).json({ message: 'You can only manage your own videos' });
        }

        if (!video.filename) {
            return res.status(400).json({ message: 'Video file is missing' });
        }

        await Video.updateOne(
            { _id: video._id },
            { transcribeStatus: 'pending', transcribeError: '' },
        );

        scheduleVideoTranscription(
            video._id,
            path.join(UPLOAD_DIR, video.filename),
            video.sourceLocale || 'en',
            { force: true },
        );

        return res.json({
            message: 'Speech caption generation started',
            transcribeStatus: 'processing',
        });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to start transcription', err);
    }
};

module.exports = {
    listVideos,
    uploadVideo,
    updateVideo,
    deleteVideo,
    recordView,
    retryTranscription,
};
