#!/usr/bin/env node
/**
 * Retry speech captions for videos that failed / skipped / are pending.
 * Usage: node scripts/retryCaptions.js
 *        node scripts/retryCaptions.js <videoId>
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'config', 'config.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

async function main() {
    const Video = require('../models/videoModel');
    const { scheduleVideoTranscription, transcribeVideoToSubtitles } =
        require('../utils/transcribeVideo');

    await mongoose.connect(process.env.DB_URI);
    const onlyId = process.argv[2];

    const filter = onlyId
        ? { _id: onlyId }
        : { transcribeStatus: { $in: ['failed', 'skipped', 'pending', 'processing'] } };

    const videos = await Video.find(filter).sort({ createdAt: -1 }).lean();
    if (!videos.length) {
        console.log('No videos to retry.');
        await mongoose.disconnect();
        return;
    }

    console.log(`Retrying captions for ${videos.length} video(s)… provider=${process.env.TRANSCRIBE_PROVIDER || 'local'}`);

    for (const doc of videos) {
        const videoPath = path.join(__dirname, '..', 'uploads', 'videos', doc.filename);
        if (!fs.existsSync(videoPath)) {
            console.warn(`SKIP ${doc._id} (${doc.title}) — file missing: ${doc.filename}`);
            continue;
        }
        console.log(`→ ${doc._id} “${doc.title}” (${doc.transcribeStatus})`);
        try {
            await Video.updateOne(
                { _id: doc._id },
                { transcribeStatus: 'processing', transcribeError: '' },
            );
            await transcribeVideoToSubtitles(doc._id, videoPath, doc.sourceLocale || 'en');
        } catch (err) {
            console.error(`  failed:`, err.message);
            await Video.updateOne(
                { _id: doc._id },
                {
                    transcribeStatus: 'failed',
                    transcribeError: String(err.message || err).slice(0, 500),
                },
            );
        }
    }

    await mongoose.disconnect();
    console.log('Done.');
}

main().catch(async (err) => {
    console.error(err);
    try {
        await mongoose.disconnect();
    } catch {
        /* ignore */
    }
    process.exit(1);
});
