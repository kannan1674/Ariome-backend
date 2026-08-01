const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { getCorsOptions, parseAllowedOrigins } = require('./config/cors');

const ALLOWED_ORIGINS = new Set(parseAllowedOrigins());

function applyUploadCors(req, res) {
    const origin = req.get('Origin');
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else if (!origin) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
}
//const { mongoSanitizeBody } = require('./middleware/mongoSanitizeMiddleware');

function loadRoute(name, loader) {
    const start = Date.now();
    process.stdout.write(`  loading ${name}...`);
    const mod = loader();
    console.log(` done (${Date.now() - start}ms)`);
    return mod;
}

/** Fast: Express + middleware only (no route modules). */
function createApp() {
    const app = express();

    app.use(
        helmet({
            crossOriginResourcePolicy: { policy: 'cross-origin' },
        }),
    );
    app.use(cors(getCorsOptions()));
    app.use(express.json({ limit: '10kb' }));
    //app.use(mongoSanitizeBody);
    app.use('/uploads', (req, res, next) => {
        applyUploadCors(req, res);
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            return res.sendStatus(204);
        }
        next();
    });

    app.use(
        '/uploads/videos',
        express.static(path.join(__dirname, 'uploads', 'videos'), {
            maxAge: '7d',
            etag: true,
            lastModified: true,
            setHeaders(res, filePath) {
                const lower = filePath.toLowerCase();
                const streamable = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.ogg', '.m4v'];
                if (streamable.some((ext) => lower.endsWith(ext))) {
                    res.setHeader('Accept-Ranges', 'bytes');
                }
                if (lower.endsWith('.mkv')) {
                    res.setHeader('Content-Type', 'video/x-matroska');
                }
            },
        }),
    );
    app.use(
        '/uploads/thumbnails',
        express.static(path.join(__dirname, 'uploads', 'thumbnails'), {
            maxAge: '7d',
            etag: true,
            lastModified: true,
        }),
    );
    app.use(
        '/uploads/hls',
        express.static(path.join(__dirname, 'uploads', 'hls'), {
            maxAge: '7d',
            etag: true,
            lastModified: true,
            setHeaders(res, filePath) {
                const lower = filePath.toLowerCase();
                if (lower.endsWith('.m3u8')) {
                    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                } else if (lower.endsWith('.ts')) {
                    res.setHeader('Content-Type', 'video/mp2t');
                }
            },
        }),
    );
    app.use(
        '/uploads/subtitles',
        express.static(path.join(__dirname, 'uploads', 'subtitles'), {
            maxAge: '7d',
            etag: true,
            lastModified: true,
            setHeaders(res, filePath) {
                if (filePath.toLowerCase().endsWith('.vtt')) {
                    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
                }
            },
        }),
    );

    app.get('/', (_req, res) => {
        console.log('docker added');
        res.type('text').send('docker added');
    });

    app.get('/api/auth/health', (_req, res) => {
        res.json({
            ok: true,
            message: global.__ROUTES_READY__ ? 'Auth API' : 'Server up; routes still loading',
        });
    });

    return app;
}

/** Slow: load route modules (defer until after listen). */
function mountRoutes(app) {
    const authRoutes = loadRoute('authRoutes', () => require('./Routes/authRoutes'));
    const videoRoutes = loadRoute('videoRoutes', () => require('./Routes/videoRoutes'));
    const translationRoutes = loadRoute('translationRoutes', () => require('./Routes/translationRoutes'));
    const sleepRoutes = loadRoute('sleepRoutes', () => require('./Routes/sleepRoutes'));
    const contentRoutes = loadRoute('contentRoutes', () => require('./Routes/contentRoutes'));
    const adminRoutes = loadRoute('adminRoutes', () => require('./Routes/adminRoutes'));

    app.use('/api/auth', authRoutes);
    app.use('/api/videos', videoRoutes);
    app.use('/api/translate', translationRoutes);
    app.use('/api/sleep', sleepRoutes);
    app.use('/api/content', contentRoutes);
    app.use('/api/admin', adminRoutes);

    global.__ROUTES_READY__ = true;
    console.log('All API routes mounted');
}

module.exports = { createApp, mountRoutes };
