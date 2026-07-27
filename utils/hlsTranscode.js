const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Video = require('../models/videoModel');

const HLS_DIR = path.join(__dirname, '..', 'uploads', 'hls');

/** Target heights shown in the player quality menu */
const LADDER = [
    { height: 240, videoBitrate: '400k', audioBitrate: '64k', bandwidth: 500000 },
    { height: 360, videoBitrate: '800k', audioBitrate: '96k', bandwidth: 950000 },
    { height: 480, videoBitrate: '1400k', audioBitrate: '128k', bandwidth: 1600000 },
    { height: 720, videoBitrate: '2800k', audioBitrate: '128k', bandwidth: 3000000 },
];

function getFfmpegPath() {
    try {
        const ffmpegStatic = require('ffmpeg-static');
        if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic;
    } catch {
        /* optional dependency */
    }
    return 'ffmpeg';
}

function runFfmpeg(args) {
    const ffmpeg = getFfmpegPath();
    return new Promise((resolve, reject) => {
        const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        proc.on('error', (err) => {
            if (err.code === 'ENOENT') {
                reject(new Error('ffmpeg is not installed'));
                return;
            }
            reject(err);
        });
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(stderr.slice(-800) || `ffmpeg exited with code ${code}`));
        });
    });
}

function writeMasterPlaylist(outDir, variants) {
    const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
    for (const v of variants) {
        const width = Math.round((v.height * 16) / 9);
        lines.push(
            `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${width}x${v.height}`,
            `${v.height}/index.m3u8`,
        );
    }
    fs.writeFileSync(path.join(outDir, 'master.m3u8'), `${lines.join('\n')}\n`, 'utf8');
}

async function transcodeVariant(inputPath, outDir, rendition) {
    const variantDir = path.join(outDir, String(rendition.height));
    fs.mkdirSync(variantDir, { recursive: true });
    const playlist = path.join(variantDir, 'index.m3u8');
    const segmentPattern = path.join(variantDir, 'seg_%03d.ts');

    await runFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-vf',
        `scale=-2:${rendition.height}`,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-b:v',
        rendition.videoBitrate,
        '-c:a',
        'aac',
        '-b:a',
        rendition.audioBitrate,
        '-ac',
        '2',
        '-hls_time',
        '6',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_filename',
        segmentPattern,
        playlist,
    ]);
}

async function transcodeVideoToHls(videoId, inputPath) {
    const id = String(videoId);
    const outDir = path.join(HLS_DIR, id);
    fs.mkdirSync(outDir, { recursive: true });

    const created = [];
    for (const rendition of LADDER) {
        await transcodeVariant(inputPath, outDir, rendition);
        created.push(rendition);
    }

    writeMasterPlaylist(outDir, created);
    return `${id}/master.m3u8`;
}

function deleteHlsOutput(videoId) {
    if (!videoId) return;
    const dir = path.join(HLS_DIR, String(videoId));
    fs.rm(dir, { recursive: true, force: true }, () => {});
}

const activeJobs = new Set();

function scheduleHlsTranscode(videoId, inputPath) {
    const id = String(videoId);
    if (activeJobs.has(id)) return;
    activeJobs.add(id);

    void (async () => {
        try {
            await Video.updateOne({ _id: videoId }, { transcodeStatus: 'processing' });
            const manifest = await transcodeVideoToHls(videoId, inputPath);
            await Video.updateOne(
                { _id: videoId },
                { hlsManifest: manifest, transcodeStatus: 'ready' },
            );
            console.log(`[hls] ready for video ${id}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const skipped = /not installed/i.test(message);
            await Video.updateOne(
                { _id: videoId },
                { transcodeStatus: skipped ? 'skipped' : 'failed' },
            );
            console.warn(`[hls] ${skipped ? 'skipped' : 'failed'} for video ${id}:`, message);
        } finally {
            activeJobs.delete(id);
        }
    })();
}

module.exports = {
    HLS_DIR,
    LADDER,
    scheduleHlsTranscode,
    transcodeVideoToHls,
    deleteHlsOutput,
    getFfmpegPath,
};
