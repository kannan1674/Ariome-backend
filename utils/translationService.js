const memoryCache = new Map();

const LOCALE_TO_LANG = {
    en: 'en',
    es: 'es',
    fr: 'fr',
    hi: 'hi',
    ta: 'ta',
};

function cacheKey(text, source, target) {
    return `${source}|${target}|${text}`;
}

async function translateWithOpenAI(text, sourceLocale, targetLocale) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const targetName = { en: 'English', es: 'Spanish', fr: 'French', hi: 'Hindi', ta: 'Tamil' }[
        targetLocale
    ] || targetLocale;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: process.env.OPENAI_TRANSLATE_MODEL || 'gpt-4o-mini',
            temperature: 0.2,
            messages: [
                {
                    role: 'system',
                    content:
                        'You translate wellness and meditation app copy. Return only the translation, no quotes or explanation.',
                },
                {
                    role: 'user',
                    content: `Translate from ${sourceLocale} to ${targetName}:\n\n${text}`,
                },
            ],
        }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const translated = data?.choices?.[0]?.message?.content?.trim();
    return translated || null;
}

async function translateWithMyMemory(text, sourceLocale, targetLocale) {
    const source = LOCALE_TO_LANG[sourceLocale] || sourceLocale;
    const target = LOCALE_TO_LANG[targetLocale] || targetLocale;
    if (source === target) return text;

    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', text.slice(0, 500));
    url.searchParams.set('langpair', `${source}|${target}`);

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (!translated || translated === text) return null;
    return String(translated).trim();
}

/**
 * AI-assisted translation with in-memory cache.
 * Uses OpenAI when OPENAI_API_KEY is set, otherwise MyMemory free API.
 */
async function translateText(text, sourceLocale = 'en', targetLocale = 'en') {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { translatedText: '', provider: 'none' };
    if (sourceLocale === targetLocale) {
        return { translatedText: trimmed, provider: 'identity' };
    }

    const key = cacheKey(trimmed, sourceLocale, targetLocale);
    if (memoryCache.has(key)) {
        return { translatedText: memoryCache.get(key), provider: 'cache' };
    }

    let translated =
        (await translateWithOpenAI(trimmed, sourceLocale, targetLocale)) ||
        (await translateWithMyMemory(trimmed, sourceLocale, targetLocale));

    if (!translated) {
        translated = trimmed;
    }

    memoryCache.set(key, translated);
    return {
        translatedText: translated,
        provider: process.env.OPENAI_API_KEY ? 'openai' : 'mymemory',
    };
}

async function translateFields(title, description, sourceLocale, targetLocale) {
    const [titleRes, descRes] = await Promise.all([
        translateText(title, sourceLocale, targetLocale),
        description
            ? translateText(description, sourceLocale, targetLocale)
            : Promise.resolve({ translatedText: '', provider: 'none' }),
    ]);
    return {
        title: titleRes.translatedText,
        description: descRes.translatedText,
        provider: titleRes.provider,
    };
}

module.exports = {
    translateText,
    translateFields,
    LOCALE_TO_LANG,
};
