const rateLimit = require('express-rate-limit');

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000;

function createLimiter({ max, message }) {
    return rateLimit({
        windowMs: WINDOW_MS,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message },
        handler: (req, res, _next, options) => {
            res.status(options.statusCode).json(options.message);
        },
    });
}

const limiters = {
    authRateLimiter: createLimiter({
        max: Number(process.env.RATE_LIMIT_AUTH_MAX) || 100,
        message: 'Too many requests. Please try again later in 1 minute.',
    }),
    loginRateLimiter: createLimiter({
        max: Number(process.env.RATE_LIMIT_LOGIN_MAX) || 5,
        message: 'Too many login attempts. Please try again later in 1 minute.',
    }),
    sensitiveAuthRateLimiter: createLimiter({
        max: Number(process.env.RATE_LIMIT_SENSITIVE_MAX) || 20,
        message: 'Too many attempts. Please try again later in 1 minute.',
    }),
};

module.exports = limiters;
