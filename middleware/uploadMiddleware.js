const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'videos');
const THUMBNAIL_DIR = path.join(__dirname, '..', 'uploads', 'thumbnails');

/** Maximum upload size: 2 GB */
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

const VIDEO_MIME = new Set([
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/matroska',
    'application/x-matroska',
    'video/avi',
]);

const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v']);

const THUMBNAIL_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Trust file extension first (macOS MKV often uses odd MIME types). */
function isAllowedVideo(file) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (VIDEO_EXT.has(ext)) return true;
    if (VIDEO_MIME.has(file.mimetype)) return true;
    const generic =
        file.mimetype === 'application/octet-stream' ||
        file.mimetype === 'binary/octet-stream';
    return generic && VIDEO_EXT.has(ext);
}

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(THUMBNAIL_DIR)) {
    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
}

function uniqueName(originalName, allowedExt, fallbackExt) {
    const ext = path.extname(originalName || '').toLowerCase();
    const safeExt = allowedExt.includes(ext) ? ext : fallbackExt;
    return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`;
}

const storage = multer.diskStorage({
    destination(_req, file, cb) {
        if (file.fieldname === 'thumbnail') {
            return cb(null, THUMBNAIL_DIR);
        }
        return cb(null, UPLOAD_DIR);
    },
    filename(_req, file, cb) {
        if (file.fieldname === 'thumbnail') {
            return cb(null, uniqueName(file.originalname, ['.jpg', '.jpeg', '.png', '.webp', '.gif'], '.jpg'));
        }
        return cb(null, uniqueName(file.originalname, ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'], '.mp4'));
    },
});

function fileFilter(_req, file, cb) {
    if (file.fieldname === 'video') {
        if (isAllowedVideo(file)) return cb(null, true);
        return cb(new Error('Only video files are allowed (mp4, webm, mov, mkv, avi, etc.)'));
    }
    if (file.fieldname === 'thumbnail') {
        if (THUMBNAIL_MIME.has(file.mimetype)) return cb(null, true);
        return cb(new Error('Thumbnail must be JPG, PNG, WebP, or GIF'));
    }
    return cb(new Error('Unexpected upload field'));
}

const uploadFields = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_VIDEO_BYTES,
        files: 2,
    },
}).fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
]);

function handleUpload(req, res, next) {
    uploadFields(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            const isThumb = err.field === 'thumbnail';
            return res.status(400).json({
                message: isThumb
                    ? 'Thumbnail must be 5 MB or smaller.'
                    : 'Video must be 2 GB or smaller.',
            });
        }
        return res.status(400).json({
            message: err.message || 'Video upload failed',
        });
    });
}

/** PATCH /:id — metadata + optional new thumbnail (no video file). */
const updateFields = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_THUMBNAIL_BYTES,
        files: 1,
    },
}).fields([{ name: 'thumbnail', maxCount: 1 }]);

function handleUpdate(req, res, next) {
    updateFields(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'Thumbnail must be 5 MB or smaller.' });
        }
        return res.status(400).json({
            message: err.message || 'Update failed',
        });
    });
}

module.exports = {
    handleUpload,
    handleUpdate,
    UPLOAD_DIR,
    THUMBNAIL_DIR,
    MAX_VIDEO_BYTES,
    MAX_THUMBNAIL_BYTES,
};
