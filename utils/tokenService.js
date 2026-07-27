const crypto = require('crypto');

function getJwt() {
    return require('jsonwebtoken');
}

const ACCESS_TOKEN_EXPIRE = process.env.JWT_ACCESS_EXPIRE || process.env.JWT_EXPIRE || '30m';
const REFRESH_TOKEN_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';
const SESSION_INFO_MINUTES = Number(process.env.SESSION_INFO_EXPIRE_MINUTES) || 30;
const ACCESS_TOKEN_MS = parseDurationMs(ACCESS_TOKEN_EXPIRE, 30 * 60 * 1000);
const REFRESH_TOKEN_MS = parseDurationMs(REFRESH_TOKEN_EXPIRE, 7 * 24 * 60 * 60 * 1000);
const SESSION_INFO_MS = SESSION_INFO_MINUTES * 60 * 1000;

function parseDurationMs(value, fallbackMs) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d+)([smhd])?$/i);
    if (!match) return fallbackMs;
    const amount = Number(match[1]);
    const unit = (match[2] || 's').toLowerCase();
    const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
    return amount * (multipliers[unit] || 1000);
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function createRefreshToken() {
    return crypto.randomBytes(48).toString('hex');
}

function signAccessToken(userId, sessionId) {
    return getJwt().sign({ id: userId, sid: String(sessionId) }, process.env.JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRE,
    });
}

function getAccessTokenExpiresAt(fromDate = new Date()) {
    return new Date(fromDate.getTime() + ACCESS_TOKEN_MS);
}

function getSessionExpiresAt(fromDate = new Date()) {
    return new Date(fromDate.getTime() + SESSION_INFO_MS);
}

function getRefreshExpiresAt(fromDate = new Date()) {
    return new Date(fromDate.getTime() + REFRESH_TOKEN_MS);
}

function buildSessionMeta(sessionExpiresAt, accessTokenExpiresAt) {
    const now = Date.now();
    const sessionMs = Math.max(0, sessionExpiresAt.getTime() - now);
    const accessMs = Math.max(0, accessTokenExpiresAt.getTime() - now);
    // Schedule refresh from access-token expiry so a short session-info window cannot loop refreshes.
    const refreshAtMs = accessTokenExpiresAt.getTime() - 60 * 1000;

    return {
        sessionExpiresAt: sessionExpiresAt.toISOString(),
        accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
        sessionExpiresInSeconds: Math.floor(sessionMs / 1000),
        accessTokenExpiresInSeconds: Math.floor(accessMs / 1000),
        shouldRefreshBefore: new Date(refreshAtMs).toISOString(),
    };
}

module.exports = {
    ACCESS_TOKEN_EXPIRE,
    REFRESH_TOKEN_EXPIRE,
    SESSION_INFO_MINUTES,
    hashToken,
    createRefreshToken,
    signAccessToken,
    getAccessTokenExpiresAt,
    getSessionExpiresAt,
    getRefreshExpiresAt,
    buildSessionMeta,
};
