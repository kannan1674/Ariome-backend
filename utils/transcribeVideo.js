const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Video = require('../models/videoModel');
const { translateText } = require('../utils/translationService');
const { getFfmpegPath } = require('./hlsTranscode');
const {
    SUBTITLE_DIR,
    SUPPORTED_LOCALES,
    subtitleFilename,
    writeSubtitleFiles,
} = require('./subtitleVtt');

const TMP_DIR = path.join(__dirname, '..', 'uploads', 'tmp');
const LOCAL_WHISPER_SCRIPT = path.join(__dirname, '..', 'scripts', 'local_whisper_transcribe.py');
const LOCAL_WHISPER_PYTHON = path.join(__dirname, '..', '.venv-whisper', 'bin', 'python');

function runFfmpeg(args) {
    const ffmpeg = getFfmpegPath();
    return new Promise((resolve, reject) => {
        const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(stderr.slice(-500) || `ffmpeg exited ${code}`));
        });
    });
}

function parseVttTime(timeStr) {
    const parts = timeStr.trim().split(':');
    if (parts.length === 3) {
        const [h, m, rest] = parts;
        const [s, ms] = rest.split('.');
        return (
            Number(h) * 3600 +
            Number(m) * 60 +
            Number(s) +
            (Number(ms || 0) || 0) / 1000
        );
    }
    if (parts.length === 2) {
        const [m, rest] = parts;
        const [s, ms] = rest.split('.');
        return Number(m) * 60 + Number(s) + (Number(ms || 0) || 0) / 1000;
    }
    return 0;
}

function formatVttTime(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    const ms = Math.round((total % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function parseVttCues(vtt) {
    const normalized = String(vtt || '').replace(/\r/g, '').trim();
    if (!normalized) return [];

    const blocks = normalized.split(/\n\n+/);
    const cues = [];

    for (const block of blocks) {
        const lines = block.split('\n');
        const timing = lines.find((l) => l.includes('-->'));
        if (!timing) continue;
        const [startRaw, endRaw] = timing.split('-->').map((s) => s.trim());
        const text = lines
            .slice(lines.indexOf(timing) + 1)
            .join('\n')
            .trim();
        if (!text) continue;
        cues.push({
            start: parseVttTime(startRaw),
            end: parseVttTime(endRaw),
            text,
        });
    }

    return cues;
}

function buildVttFromCues(cues) {
    const lines = ['WEBVTT', ''];
    for (const cue of cues) {
        lines.push(`${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}`);
        lines.push(cue.text);
        lines.push('');
    }
    return `${lines.join('\n').trim()}\n`;
}

const WHISPER_MAX_BYTES = 24 * 1024 * 1024;
const CHUNK_SECONDS = 600;

function getTranscribeProvider() {
    const raw = String(process.env.TRANSCRIBE_PROVIDER || 'local').trim().toLowerCase();
    if (raw === 'openai' || raw === 'api') return 'openai';
    if (raw === 'auto') return 'auto';
    return 'local';
}

function localWhisperAvailable() {
    return fs.existsSync(LOCAL_WHISPER_PYTHON) && fs.existsSync(LOCAL_WHISPER_SCRIPT);
}

function getMediaDuration(videoPath) {
    const ffmpeg = getFfmpegPath();
    return new Promise((resolve) => {
        const proc = spawn(ffmpeg, ['-i', videoPath], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        proc.on('close', () => {
            const match = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
            if (!match) {
                resolve(0);
                return;
            }
            const hours = Number(match[1]);
            const minutes = Number(match[2]);
            const seconds = Number(match[3]);
            resolve(hours * 3600 + minutes * 60 + seconds);
        });
        proc.on('error', () => resolve(0));
    });
}

async function extractAudio(videoPath, audioPath, startSec = 0, durationSec = null) {
    fs.mkdirSync(path.dirname(audioPath), { recursive: true });
    const args = ['-y'];
    if (startSec > 0) {
        args.push('-ss', String(startSec));
    }
    // WAV is friendlier for local Whisper than MP3 and avoids encoder quirks.
    args.push('-i', videoPath, '-vn', '-ac', '1', '-ar', '16000');
    if (durationSec != null && durationSec > 0) {
        args.push('-t', String(durationSec));
    }
    args.push(audioPath);
    await runFfmpeg(args);
}

function runLocalWhisper(audioPath, outputVtt, language) {
    const model = process.env.LOCAL_WHISPER_MODEL || 'base';
    const pythonBin = process.env.LOCAL_WHISPER_PYTHON || LOCAL_WHISPER_PYTHON;
    const ffmpegBin = getFfmpegPath();

    return new Promise((resolve, reject) => {
        const args = [
            LOCAL_WHISPER_SCRIPT,
            '--audio',
            audioPath,
            '--output',
            outputVtt,
            '--model',
            model,
        ];
        if (language && language !== 'auto') {
            args.push('--language', language);
        }

        const env = {
            ...process.env,
            // openai-whisper shells out to ffmpeg; point it at bundled binary.
            PATH: `${path.dirname(ffmpegBin)}${path.delimiter}${process.env.PATH || ''}`,
        };

        const proc = spawn(pythonBin, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env,
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputVtt)) {
                resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
                return;
            }
            if (code === 2 || /no speech detected/i.test(stderr)) {
                reject(new Error('No speech detected in video'));
                return;
            }
            reject(
                new Error(
                    stderr.slice(-800) ||
                        stdout.slice(-400) ||
                        `Local Whisper exited ${code}`,
                ),
            );
        });
    });
}

async function whisperVttOpenAI(audioPath, language) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OPENAI_API_KEY not configured');
    }

    const buffer = fs.readFileSync(audioPath);
    const form = new FormData();
    form.append(
        'file',
        new Blob([buffer], { type: 'audio/wav' }),
        path.basename(audioPath),
    );
    form.append('model', process.env.OPENAI_WHISPER_MODEL || 'whisper-1');
    form.append('response_format', 'vtt');
    if (language && language !== 'auto') {
        form.append('language', language);
    }

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText.slice(0, 400) || `Whisper API ${res.status}`);
    }

    return res.text();
}

async function whisperVtt(audioPath, language) {
    const provider = getTranscribeProvider();
    const canLocal = localWhisperAvailable();
    const canOpenAI = Boolean(process.env.OPENAI_API_KEY);

    const tryLocal = async () => {
        const out = `${audioPath}.vtt`;
        await runLocalWhisper(audioPath, out, language);
        const text = fs.readFileSync(out, 'utf8');
        fs.unlink(out, () => {});
        return text;
    };

    if (provider === 'local') {
        if (!canLocal) {
            throw new Error(
                'Local Whisper is not installed. Run: Backend/.venv-whisper/bin/pip install openai-whisper',
            );
        }
        return tryLocal();
    }

    if (provider === 'openai') {
        return whisperVttOpenAI(audioPath, language);
    }

    // auto: prefer local, fall back to OpenAI
    if (canLocal) {
        try {
            return await tryLocal();
        } catch (err) {
            if (!canOpenAI) throw err;
            console.warn('[transcribe] local Whisper failed, falling back to OpenAI:', err.message);
        }
    }
    if (!canOpenAI) {
        throw new Error('No transcription provider available (local Whisper + OPENAI_API_KEY missing)');
    }
    return whisperVttOpenAI(audioPath, language);
}

async function translateCues(cues, sourceLocale, targetLocale) {
    const out = [];
    // Batch in small groups to keep MyMemory/OpenAI stable
    for (const cue of cues) {
        const { translatedText } = await translateText(cue.text, sourceLocale, targetLocale);
        out.push({
            start: cue.start,
            end: cue.end,
            text: translatedText || cue.text,
        });
    }
    return out;
}

function writeVttFile(videoId, locale, content) {
    fs.mkdirSync(SUBTITLE_DIR, { recursive: true });
    fs.writeFileSync(path.join(SUBTITLE_DIR, subtitleFilename(videoId, locale)), content, 'utf8');
}

async function transcribeAudioChunks(videoPath, sourceLocale) {
    const source = sourceLocale === 'auto' ? 'en' : sourceLocale;
    const duration = (await getMediaDuration(videoPath)) || 0;
    const allCues = [];
    const total = duration > 0 ? duration : CHUNK_SECONDS;
    const step = CHUNK_SECONDS;
    const useOpenAILimits = getTranscribeProvider() === 'openai';

    for (let start = 0; start < total; start += step) {
        const chunkLen = Math.min(step, total - start);
        const chunkPath = path.join(
            TMP_DIR,
            `chunk-${path.basename(videoPath)}-${start}.wav`,
        );
        try {
            await extractAudio(videoPath, chunkPath, start, chunkLen);
            if (useOpenAILimits) {
                const stat = fs.statSync(chunkPath);
                if (stat.size > WHISPER_MAX_BYTES) {
                    throw new Error(
                        'Audio chunk too large for Whisper. Try a shorter video or MP4 instead of MKV.',
                    );
                }
            }
            const vtt = await whisperVtt(chunkPath, source);
            const chunkCues = parseVttCues(vtt).map((cue) => ({
                start: cue.start + start,
                end: cue.end + start,
                text: cue.text,
            }));
            allCues.push(...chunkCues);
            console.log(
                `[transcribe] chunk ${start}s–${start + chunkLen}s → ${chunkCues.length} cues`,
            );
        } finally {
            fs.unlink(chunkPath, () => {});
        }
    }

    return { source, cues: allCues };
}

async function transcribeVideoToSubtitles(videoId, videoPath, sourceLocale = 'en') {
    const id = String(videoId);
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const audioPath = path.join(TMP_DIR, `${id}.wav`);
    const provider = getTranscribeProvider();

    try {
        let source;
        let cues;

        const mediaDuration = await getMediaDuration(videoPath);
        // Local Whisper can handle long audio; only force chunks for OpenAI size limits
        // or very long videos to keep progress visible.
        const useChunksFirst =
            provider === 'openai'
                ? mediaDuration > 45 * 60
                : mediaDuration > 90 * 60;

        console.log(
            `[transcribe] ${id}: provider=${provider} duration≈${Math.round(mediaDuration)}s`,
        );

        if (useChunksFirst) {
            console.log(
                `[transcribe] ${id}: ${Math.round(mediaDuration / 60)} min — chunked transcription`,
            );
            const chunked = await transcribeAudioChunks(videoPath, sourceLocale);
            source = chunked.source;
            cues = chunked.cues;
        } else {
            await extractAudio(videoPath, audioPath);
            const shouldChunk =
                provider === 'openai' && fs.statSync(audioPath).size > WHISPER_MAX_BYTES;
            if (shouldChunk) {
                console.log(
                    `[transcribe] ${id}: audio ${(fs.statSync(audioPath).size / 1024 / 1024).toFixed(1)}MB — using chunks`,
                );
                const chunked = await transcribeAudioChunks(videoPath, sourceLocale);
                source = chunked.source;
                cues = chunked.cues;
            } else {
                const vtt = await whisperVtt(audioPath, sourceLocale);
                source = sourceLocale === 'auto' ? 'en' : sourceLocale;
                cues = parseVttCues(vtt);
            }
        }

        if (!cues.length) {
            throw new Error('No speech detected in video');
        }

        writeVttFile(id, source, buildVttFromCues(cues));

        const otherLocales = SUPPORTED_LOCALES.filter((l) => l !== source);
        for (const locale of otherLocales) {
            try {
                const translated = await translateCues(cues, source, locale);
                writeVttFile(id, locale, buildVttFromCues(translated));
            } catch (err) {
                console.warn(`[transcribe] translate ${locale} failed for ${id}:`, err.message);
                writeVttFile(id, locale, buildVttFromCues(cues));
            }
        }

        await Video.updateOne(
            { _id: videoId },
            {
                transcribeStatus: 'ready',
                transcribeError: '',
                sourceLocale: source,
                durationSeconds: Math.ceil(cues[cues.length - 1]?.end || 0),
            },
        );
        console.log(`[transcribe] ready for video ${id} (${cues.length} cues)`);
    } finally {
        fs.unlink(audioPath, () => {});
    }
}

const activeJobs = new Set();

function parseFailureMessage(err) {
    const raw = err instanceof Error ? err.message : String(err);
    try {
        const json = JSON.parse(raw);
        if (json?.error?.message) return String(json.error.message);
    } catch {
        /* plain text */
    }
    return raw;
}

function isQuotaError(message) {
    const m = String(message || '').toLowerCase();
    return m.includes('insufficient_quota') || m.includes('exceeded your current quota');
}

function toUserTranscribeError(err) {
    const message = parseFailureMessage(err);
    if (isQuotaError(message)) {
        return 'OpenAI credits are exhausted. Switch TRANSCRIBE_PROVIDER=local or add billing, then tap Retry captions.';
    }
    if (/local whisper is not installed/i.test(message)) {
        return 'Local Whisper is not set up on the server. Install Backend/.venv-whisper, then tap Retry captions.';
    }
    if (/too large for whisper|audio chunk too large/i.test(message)) {
        return 'This video is very long. After updating the app server, tap Retry captions on My videos, or upload MP4 (H.264) instead of MKV.';
    }
    if (/no speech detected/i.test(message)) {
        return 'No clear speech was detected in this video.';
    }
    if (/openai_api_key|no transcription provider/i.test(message)) {
        return 'Speech captions are not configured on the server.';
    }
    return message.slice(0, 500) || 'Speech caption generation failed.';
}

function shouldAutoTranscribe(status) {
    return !status || status === 'pending';
}

function canTranscribe() {
    const provider = getTranscribeProvider();
    if (provider === 'local') return localWhisperAvailable();
    if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
    return localWhisperAvailable() || Boolean(process.env.OPENAI_API_KEY);
}

function scheduleVideoTranscription(videoId, videoPath, sourceLocale = 'en', { force = false } = {}) {
    const id = String(videoId);
    if (activeJobs.has(id)) return;

    void (async () => {
        if (!force) {
            const doc = await Video.findById(videoId).select('transcribeStatus').lean();
            if (!doc || !shouldAutoTranscribe(doc.transcribeStatus)) return;
        }

        if (!canTranscribe()) {
            await Video.updateOne(
                { _id: videoId },
                {
                    transcribeStatus: 'skipped',
                    transcribeError:
                        'No speech caption provider available (install local Whisper or set OPENAI_API_KEY).',
                },
            );
            const doc = await Video.findById(videoId).lean();
            if (doc) writeSubtitleFiles(doc);
            return;
        }

        activeJobs.add(id);
        try {
            await Video.updateOne(
                { _id: videoId },
                { transcribeStatus: 'processing', transcribeError: '' },
            );
            await transcribeVideoToSubtitles(videoId, videoPath, sourceLocale);
        } catch (err) {
            console.warn(`[transcribe] failed for video ${id}:`, parseFailureMessage(err));
            const userMessage = toUserTranscribeError(err);
            await Video.updateOne(
                { _id: videoId },
                { transcribeStatus: 'failed', transcribeError: userMessage },
            );
            const doc = await Video.findById(videoId).lean();
            if (doc) {
                try {
                    writeSubtitleFiles(doc);
                } catch {
                    /* fallback description captions */
                }
            }
        } finally {
            activeJobs.delete(id);
        }
    })();
}

module.exports = {
    scheduleVideoTranscription,
    transcribeVideoToSubtitles,
    parseVttCues,
    buildVttFromCues,
};
