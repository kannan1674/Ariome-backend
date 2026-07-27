const authModel = require('../models/authModel');

function getJwt() {
    return require('jsonwebtoken');
}
const { getSessionById } = require('../services/sessionService');
const { buildSessionMeta, getAccessTokenExpiresAt } = require('../utils/tokenService');

/**
 * Requires `Authorization: Bearer <jwt>` from login/register.
 * Attaches `req.user`, `req.userId`, `req.session`, `req.sessionMeta`.
 */
async function protect(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        let token;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7).trim();
        }
        if (!token) {
            return res.status(401).json({ message: 'Authorization token required' });
        }

        const decoded = getJwt().verify(token, process.env.JWT_SECRET);
        const id = decoded.id || decoded.sub;
        const sessionId = decoded.sid;
        if (!id) {
            return res.status(401).json({ message: 'Invalid token payload' });
        }

        if (!sessionId) {
            return res.status(401).json({
                message: 'Session missing from token. Please login again.',
                code: 'SESSION_REQUIRED',
            });
        }

        const session = await getSessionById(sessionId);
        if (!session || String(session.userId) !== String(id)) {
            return res.status(401).json({
                message: 'Session not found or revoked. Please login again.',
                code: 'SESSION_INVALID',
            });
        }

        const now = new Date();
        if (session.sessionExpiresAt < now) {
            return res.status(401).json({
                message: 'Session expired. Call POST /api/auth/refresh-token with your refresh token.',
                code: 'SESSION_EXPIRED',
                sessionExpiresAt: session.sessionExpiresAt.toISOString(),
            });
        }

        const user = await authModel.findById(id).select('-password');
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        if (!user.emailVerified) {
            return res.status(403).json({
                message: 'Please verify your email before accessing this resource.',
                code: 'EMAIL_NOT_VERIFIED',
            });
        }

        req.user = user;
        req.userId = user._id;
        req.session = session;
        const issuedAt = decoded.iat ? new Date(decoded.iat * 1000) : now;
        const configuredAccessExpiry = getAccessTokenExpiresAt(issuedAt);
        const jwtExpiry = decoded.exp ? new Date(decoded.exp * 1000) : configuredAccessExpiry;
        const accessTokenExpiresAt = new Date(
            Math.min(jwtExpiry.getTime(), configuredAccessExpiry.getTime()),
        );
        req.sessionMeta = buildSessionMeta(session.sessionExpiresAt, accessTokenExpiresAt);
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                message: 'Access token expired. Call POST /api/auth/refresh-token with your refresh token.',
                code: 'TOKEN_EXPIRED',
            });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Invalid token' });
        }
        return res.status(401).json({ message: 'Unauthorized' });
    }
}

module.exports = { protect };
