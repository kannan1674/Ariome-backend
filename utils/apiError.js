function isProduction() {
    return process.env.NODE_ENV === 'production';
}

/**
 * Build a JSON body for 5xx responses. Omits internal error details in production.
 */
function serverErrorPayload(message, err) {
    const payload = { message };
    if (!isProduction() && err?.message) {
        payload.error = err.message;
    }
    return payload;
}

function sendServerError(res, statusCode, message, err) {
    if (err) {
        console.error(`[${statusCode}] ${message}:`, err);
    }
    return res.status(statusCode).json(serverErrorPayload(message, err));
}

module.exports = {
    isProduction,
    serverErrorPayload,
    sendServerError,
};
