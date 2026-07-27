const { sendServerError } = require('../utils/apiError');

function fallbackRecommendations(ctx) {
    const tips = [];
    if (ctx.sleepQuality === 'Poor' || ctx.sleepQuality === 'Restless') {
        tips.push('Try a consistent bedtime within a 30-minute window each night.');
        tips.push('Avoid screens for 45 minutes before bed; use the Deep sleep sounds in the app.');
    }
    if (ctx.stressLevel === 'High' || ctx.stressLevel === 'Medium') {
        tips.push('Practice 4-7-8 breathing or box breathing for 5 minutes before sleep.');
    }
    if (ctx.dreamMood === 'Anxious' || ctx.dreamMood === 'Nightmare') {
        tips.push('Write down the dream in your journal, then a calming reframe before returning to bed.');
    }
    if (ctx.hoursSlept && ctx.hoursSlept < 6) {
        tips.push('Aim for 7–8 hours when possible; short naps before 3pm can help if you slept poorly.');
    }
    if (tips.length === 0) {
        tips.push('Keep your room cool, dark, and quiet.');
        tips.push('Wind down with gentle flute or delta-wave sleep music.');
    }
    return {
        summary: 'Here are gentle steps to support better rest tonight.',
        tonightPlan: tips.slice(0, 4),
        windDown: ['Deep sleep music (delta or night drone)', 'Sleep story or body scan', 'Dream journal if you wake'],
        morningTip: 'Get morning light within an hour of waking to anchor your rhythm.',
        provider: 'rules',
    };
}

async function generateWithOpenAI(ctx) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const userContext = [
        `Sleep quality (self-reported): ${ctx.sleepQuality || 'unknown'}`,
        `Hours slept last night: ${ctx.hoursSlept ?? 'unknown'}`,
        `Stress level: ${ctx.stressLevel || 'unknown'}`,
        `Recent dream mood: ${ctx.dreamMood || 'none logged'}`,
        ctx.recentDreamSnippet
            ? `Recent dream note: ${ctx.recentDreamSnippet.slice(0, 400)}`
            : 'No recent dream logged',
        ctx.goals ? `Goals: ${ctx.goals}` : '',
    ]
        .filter(Boolean)
        .join('\n');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: process.env.OPENAI_SLEEP_MODEL || 'gpt-4o-mini',
            temperature: 0.6,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: `You are a compassionate sleep coach for a wellness app. Respond ONLY with valid JSON:
{
  "summary": "1-2 warm sentences",
  "tonightPlan": ["3-4 specific actionable steps for tonight"],
  "windDown": ["2-3 app-friendly activities"],
  "morningTip": "one sentence for tomorrow morning"
}`,
                },
                {
                    role: 'user',
                    content: `Personalize sleep recommendations:\n\n${userContext}`,
                },
            ],
        }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return {
            summary: String(parsed.summary || ''),
            tonightPlan: Array.isArray(parsed.tonightPlan) ? parsed.tonightPlan.map(String) : [],
            windDown: Array.isArray(parsed.windDown) ? parsed.windDown.map(String) : [],
            morningTip: String(parsed.morningTip || ''),
            provider: 'openai',
        };
    } catch {
        return null;
    }
}

const postRecommendations = async (req, res) => {
    try {
        const ctx = {
            sleepQuality: String(req.body.sleepQuality || '').trim() || null,
            hoursSlept: req.body.hoursSlept != null ? Number(req.body.hoursSlept) : null,
            stressLevel: String(req.body.stressLevel || '').trim() || null,
            dreamMood: String(req.body.dreamMood || '').trim() || null,
            recentDreamSnippet: String(req.body.recentDreamSnippet || '').trim(),
            goals: String(req.body.goals || '').trim(),
        };

        const ai = await generateWithOpenAI(ctx);
        const result = ai || fallbackRecommendations(ctx);

        return res.json(result);
    } catch (err) {
        return sendServerError(res, 500, 'Failed to generate sleep recommendations', err);
    }
};

module.exports = { postRecommendations };
