/**
 * Sanitize MongoDB operator injection in JSON bodies (Express 5–compatible).
 * express-mongo-sanitize mutates req.query which is read-only in Express 5.
 */
function sanitizeValue(value) {
    if (value == null) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (typeof value === 'object') {
        const out = {};
        for (const [key, nested] of Object.entries(value)) {
            const safeKey = key.startsWith('$') ? `_${key.slice(1)}` : key.replace(/\./g, '_');
            out[safeKey] = sanitizeValue(nested);
        }
        return out;
    }
    return value;
}

function mongoSanitizeBody(req, res, next) {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeValue(req.body);
    }
    next();
}

module.exports = { mongoSanitizeBody };
