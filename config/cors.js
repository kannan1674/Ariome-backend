const DEV_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'https://ariome-frontend-gumezzs0g-meikannans-projects-1c4443eb.vercel.app'
];

function parseAllowedOrigins() {
    const raw = String(process.env.CORS_ORIGINS || '');
    const fromEnv = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    if (process.env.NODE_ENV === 'production') {
        return fromEnv;
    }

    const merged = new Set([...fromEnv, ...DEV_ORIGINS]);
    return [...merged];
}

function getCorsOptions() {
    const allowedOrigins = parseAllowedOrigins();

    return {
        origin(origin, callback) {
            // Postman, mobile apps, same-origin server calls
            if (!origin) {
                return callback(null, true);
            }
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(null, false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    };
}

module.exports = { getCorsOptions, parseAllowedOrigins };
