const { sendServerError } = require('../utils/apiError');

async function callOpenAI(system, user, json = true) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: process.env.OPENAI_CONTENT_MODEL || 'gpt-4o-mini',
            temperature: 0.7,
            ...(json ? { response_format: { type: 'json_object' } } : {}),
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
        }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return null;
    if (!json) return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function fallbackAiClips(mood) {
    const m = mood || 'Peaceful';
    return {
        clips: [
            {
                title: `${m} micro-reset`,
                description: 'A 60-second breath and gaze softening practice.',
                durationSec: 60,
                hook: 'Pause with one slow breath.',
                mood: m,
            },
            {
                title: 'Gentle reframe',
                description: 'Name one feeling, then one small next step.',
                durationSec: 90,
                hook: 'What do you need right now?',
                mood: m,
            },
            {
                title: 'Stillness snapshot',
                description: 'Notice three sounds, three breaths, three sensations.',
                durationSec: 120,
                hook: 'Ground through your senses.',
                mood: m,
            },
        ],
        provider: 'rules',
    };
}

function fallbackReflectionCard(body, moodBefore, moodAfter) {
    return {
        insight: 'You took time to notice your inner weather — that awareness itself is healing.',
        gratitude: 'Thank yourself for showing up to reflect, even briefly.',
        gentleChallenge: 'Carry one word from this reflection into your next hour.',
        affirmation: `From ${moodBefore || 'here'} toward ${moodAfter || 'calm'}, you are allowed to move slowly.`,
        provider: 'rules',
    };
}

function fallbackJournalPrompts(mood) {
    const prompts = {
        Peaceful: [
            'What felt quietly good today, even if it was small?',
            'Where in your body do you feel ease right now?',
            'What would a gentler version of tomorrow look like?',
        ],
        Grateful: [
            'Who made your day a little lighter?',
            'What ordinary moment are you thankful you noticed?',
            'What strength in yourself are you overlooking?',
        ],
        Anxious: [
            'What is within your control in the next hour?',
            'If your worry had a voice, what is it trying to protect?',
            'What would you tell a friend feeling this way?',
        ],
    };
    return {
        prompts: prompts[mood] || prompts.Peaceful,
        provider: 'rules',
    };
}

function fallbackShorts(topic, mood) {
    const t = topic || 'mindfulness';
    return {
        shorts: [
            {
                title: `60s ${t} reset`,
                hook: 'Try this before your next task.',
                script: 'Inhale for four… hold… exhale for six. Soften your jaw. You are here.',
                hashtags: ['#mindfulness', '#calm', '#shorts'],
                visualNotes: 'Close-up, soft light, text overlay on breath counts.',
                durationSec: 60,
                mood: mood || 'Peaceful',
            },
            {
                title: `Quick ${t} tip`,
                hook: 'One thing you can do right now.',
                script: 'Name three things you see. One thing you hear. One slow breath.',
                hashtags: ['#wellness', '#grounding'],
                visualNotes: 'POV style, nature B-roll optional.',
                durationSec: 45,
                mood: mood || 'Peaceful',
            },
        ],
        provider: 'rules',
    };
}

const postAiClips = async (req, res) => {
    try {
        const mood = String(req.body.mood || 'Peaceful').trim();
        const interests = String(req.body.interests || '').trim();

        const ai = await callOpenAI(
            `You suggest wellness micro-video clips for a meditation app. JSON only: { "clips": [{ "title", "description", "durationSec" (30-180), "hook", "mood" }] } — exactly 4 clips.`,
            `Mood: ${mood}. Interests: ${interests || 'general wellness'}.`,
        );

        return res.json(ai?.clips?.length ? { ...ai, provider: 'openai' } : fallbackAiClips(mood));
    } catch (err) {
        return sendServerError(res, 500, 'Failed to generate AI clips', err);
    }
};

const postReflectionCard = async (req, res) => {
    try {
        const body = String(req.body.body || '').trim();
        const moodBefore = String(req.body.moodBefore || '').trim();
        const moodAfter = String(req.body.moodAfter || '').trim();

        if (!body) {
            return res.status(400).json({ message: 'Reflection body is required' });
        }

        const ai = await callOpenAI(
            `You are a warm journaling coach. JSON: { "insight", "gratitude", "gentleChallenge", "affirmation" } — each 1-2 sentences, compassionate.`,
            `Before: ${moodBefore}. After: ${moodAfter}.\n\nReflection:\n${body.slice(0, 1500)}`,
        );

        return res.json(
            ai?.insight ? { ...ai, provider: 'openai' } : fallbackReflectionCard(body, moodBefore, moodAfter),
        );
    } catch (err) {
        return sendServerError(res, 500, 'Failed to generate reflection card', err);
    }
};

const postJournalPrompts = async (req, res) => {
    try {
        const mood = String(req.body.mood || 'Reflective').trim();
        const theme = String(req.body.theme || 'daily reflection').trim();

        const ai = await callOpenAI(
            `Generate journal prompts for a wellness app. JSON: { "prompts": [5 unique open-ended questions] }. Warm, non-clinical.`,
            `Mood: ${mood}. Theme: ${theme}.`,
        );

        return res.json(
            ai?.prompts?.length ? { prompts: ai.prompts, provider: 'openai' } : fallbackJournalPrompts(mood),
        );
    } catch (err) {
        return sendServerError(res, 500, 'Failed to generate journal prompts', err);
    }
};

async function synthesizeShortVoice(text) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const input = String(text || '')
        .trim()
        .slice(0, 4096);
    if (!input) return null;

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: process.env.OPENAI_TTS_MODEL || 'tts-1',
            voice: process.env.OPENAI_TTS_VOICE || 'nova',
            input,
        }),
    });

    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer;
}

const postShortVideoVoice = async (req, res) => {
    try {
        const text = String(req.body.text || '').trim();
        if (!text) {
            return res.status(400).json({ message: 'Text is required for voice generation' });
        }

        const audio = await synthesizeShortVoice(text);
        if (!audio) {
            return res.status(503).json({
                message:
                    'AI voice unavailable. Add OPENAI_API_KEY to Backend/config/config.env and restart the server.',
                hasVoice: false,
            });
        }

        return res.json({
            hasVoice: true,
            audioBase64: audio.toString('base64'),
            mimeType: 'audio/mpeg',
            provider: 'openai',
        });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to generate voice', err);
    }
};

const postShortsGenerate = async (req, res) => {
    try {
        const topic = String(req.body.topic || 'mindfulness').trim();
        const mood = String(req.body.mood || 'Peaceful').trim();
        const count = Math.min(5, Math.max(1, Number(req.body.count) || 3));

        const ai = await callOpenAI(
            `You write short-form vertical video scripts (Shorts/Reels) for wellness creators. JSON: { "shorts": [{ "title", "hook", "script" (under 100 words), "hashtags" (array of 3-5), "visualNotes", "durationSec" (30-90), "mood" }] }.`,
            `Create ${count} shorts. Topic: ${topic}. Mood: ${mood}.`,
        );

        return res.json(
            ai?.shorts?.length ? { ...ai, provider: 'openai' } : fallbackShorts(topic, mood),
        );
    } catch (err) {
        return sendServerError(res, 500, 'Failed to generate shorts', err);
    }
};

module.exports = {
    postAiClips,
    postReflectionCard,
    postJournalPrompts,
    postShortsGenerate,
    postShortVideoVoice,
};
