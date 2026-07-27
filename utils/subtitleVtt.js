const path = require('path');
const fs = require('fs');

const SUBTITLE_DIR = path.join(__dirname, '..', 'uploads', 'subtitles');

const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'hi', 'ta'];

const LOCALE_LABELS = {
    en: 'English',
    es: 'Español',
    fr: 'Français',
    hi: 'हिन्दी',
    ta: 'தமிழ்',
};

function formatVttTime(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    const ms = Math.round((total % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function escapeVtt(text) {
    return String(text || '')
        .replace(/\r/g, '')
        .trim()
        .replace(/</g, '&lt;');
}

function buildVttContent(title, description, durationSeconds) {
    const fromMeta = Number(durationSeconds);
    const dur =
        Number.isFinite(fromMeta) && fromMeta >= 60
            ? Math.min(fromMeta, 6 * 60 * 60)
            : 6 * 60 * 60;
    const end = formatVttTime(dur);
    const body = escapeVtt(description) || escapeVtt(title) || ' ';
    return `WEBVTT

00:00:00.000 --> ${end}
${body}
`;
}

function getTextForLocale(doc, locale) {
    const source = doc.sourceLocale || 'en';
    if (locale === source) {
        return {
            title: doc.title,
            description: doc.description || '',
        };
    }
    const entry = doc.translations?.get?.(locale) || doc.translations?.[locale];
    if (entry?.title) {
        return {
            title: entry.title,
            description: entry.description || doc.description || '',
        };
    }
    return {
        title: doc.title,
        description: doc.description || '',
    };
}

function subtitleFilename(videoId, locale) {
    return `${videoId}-${locale}.vtt`;
}

function writeSubtitleFiles(doc) {
    if (!doc?._id) return [];
    fs.mkdirSync(SUBTITLE_DIR, { recursive: true });
    const written = [];
    for (const locale of SUPPORTED_LOCALES) {
        const text = getTextForLocale(doc, locale);
        const filename = subtitleFilename(doc._id, locale);
        const filePath = path.join(SUBTITLE_DIR, filename);
        const content = buildVttContent(text.title, text.description, doc.durationSeconds);
        fs.writeFileSync(filePath, content, 'utf8');
        written.push(locale);
    }
    return written;
}

function buildSubtitleUrl(req, videoId, locale) {
    const base = `${req.protocol}://${req.get('host')}`;
    return `${base}/uploads/subtitles/${subtitleFilename(videoId, locale)}`;
}

function buildSubtitleTracks(doc, req) {
    const videoId = String(doc._id || doc.id);
    const source = doc.sourceLocale || 'en';

    const probe = path.join(SUBTITLE_DIR, subtitleFilename(videoId, 'en'));
    const hasSpeechCaptions = doc.transcribeStatus === 'ready';
    if (!fs.existsSync(probe) && !hasSpeechCaptions) {
        try {
            writeSubtitleFiles(doc);
        } catch {
            /* non-fatal */
        }
    }

    return SUPPORTED_LOCALES.map((locale) => ({
        language: locale,
        label: LOCALE_LABELS[locale] || locale,
        url: buildSubtitleUrl(req, videoId, locale),
        default: locale === source,
    }));
}

function deleteSubtitleFiles(videoId) {
    if (!videoId) return;
    for (const locale of SUPPORTED_LOCALES) {
        const filePath = path.join(SUBTITLE_DIR, subtitleFilename(videoId, locale));
        fs.unlink(filePath, () => {});
    }
}

module.exports = {
    SUBTITLE_DIR,
    SUPPORTED_LOCALES,
    LOCALE_LABELS,
    subtitleFilename,
    writeSubtitleFiles,
    buildSubtitleTracks,
    buildSubtitleUrl,
    deleteSubtitleFiles,
};
