const { translateText, translateFields } = require('../utils/translationService');
const { sendServerError } = require('../utils/apiError');

const SUPPORTED = new Set(['en', 'es', 'fr', 'hi', 'ta']);

function normalizeLocale(value) {
    const base = String(value || 'en')
        .split('-')[0]
        .toLowerCase();
    return SUPPORTED.has(base) ? base : 'en';
}

const postTranslate = async (req, res) => {
    try {
        const text = String(req.body.text || '').trim();
        const targetLocale = normalizeLocale(req.body.targetLocale);
        const sourceLocale = normalizeLocale(req.body.sourceLocale || 'en');

        if (!text) {
            return res.status(400).json({ message: 'text is required' });
        }
        if (text.length > 2000) {
            return res.status(400).json({ message: 'text exceeds 2000 characters' });
        }

        const result = await translateText(text, sourceLocale, targetLocale);
        return res.json({
            text,
            translatedText: result.translatedText,
            sourceLocale,
            targetLocale,
            provider: result.provider,
        });
    } catch (err) {
        return sendServerError(res, 500, 'Translation failed', err);
    }
};

const postTranslateBatch = async (req, res) => {
    try {
        const items = Array.isArray(req.body.items) ? req.body.items : [];
        const targetLocale = normalizeLocale(req.body.targetLocale);
        const sourceLocale = normalizeLocale(req.body.sourceLocale || 'en');

        if (items.length === 0) {
            return res.status(400).json({ message: 'items array is required' });
        }
        if (items.length > 20) {
            return res.status(400).json({ message: 'Maximum 20 items per batch' });
        }

        const results = await Promise.all(
            items.map(async (item) => {
                const id = String(item.id || '');
                const translated = await translateFields(
                    String(item.title || ''),
                    String(item.description || ''),
                    sourceLocale,
                    targetLocale,
                );
                return { id, ...translated };
            }),
        );

        return res.json({ targetLocale, sourceLocale, items: results });
    } catch (err) {
        return sendServerError(res, 500, 'Batch translation failed', err);
    }
};

module.exports = { postTranslate, postTranslateBatch };
