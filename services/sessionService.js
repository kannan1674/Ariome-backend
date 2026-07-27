const Session = require('../models/sessionModel');
const {
    hashToken,
    createRefreshToken,
    signAccessToken,
    getAccessTokenExpiresAt,
    getSessionExpiresAt,
    getRefreshExpiresAt,
    buildSessionMeta,
} = require('../utils/tokenService');

async function createAuthSession(userId) {
    const refreshToken = createRefreshToken();
    const now = new Date();
    const sessionExpiresAt = getSessionExpiresAt(now);
    const refreshExpiresAt = getRefreshExpiresAt(now);
    const accessTokenExpiresAt = getAccessTokenExpiresAt(now);

    const session = await Session.create({
        userId,
        refreshTokenHash: hashToken(refreshToken),
        sessionExpiresAt,
        refreshExpiresAt,
    });

    const accessToken = signAccessToken(userId, session._id);

    return {
        accessToken,
        refreshToken,
        session,
        sessionMeta: buildSessionMeta(sessionExpiresAt, accessTokenExpiresAt),
    };
}

async function refreshAuthSession(refreshToken) {
    const refreshTokenHash = hashToken(refreshToken);
    const session = await Session.findOne({ refreshTokenHash }).select('+refreshTokenHash');

    if (!session || session.revoked) {
        return { error: 'INVALID_REFRESH_TOKEN', status: 401 };
    }

    const now = new Date();
    if (session.refreshExpiresAt < now) {
        session.revoked = true;
        await session.save();
        return { error: 'REFRESH_TOKEN_EXPIRED', status: 401 };
    }

    const sessionExpiresAt = getSessionExpiresAt(now);
    const accessTokenExpiresAt = getAccessTokenExpiresAt(now);

    session.sessionExpiresAt = sessionExpiresAt;
    await session.save();

    const accessToken = signAccessToken(session.userId, session._id);

    return {
        accessToken,
        refreshToken,
        session,
        sessionMeta: buildSessionMeta(sessionExpiresAt, accessTokenExpiresAt),
    };
}

async function revokeSession(sessionId) {
    await Session.findByIdAndUpdate(sessionId, { revoked: true });
}

async function getSessionById(sessionId) {
    return Session.findOne({ _id: sessionId, revoked: false });
}

module.exports = {
    createAuthSession,
    refreshAuthSession,
    revokeSession,
    getSessionById,
};
