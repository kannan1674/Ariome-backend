const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        description: {
            type: String,
            trim: true,
            default: '',
            maxlength: 2000,
        },
        mood: {
            type: String,
            enum: ['Peaceful', 'Grateful', 'Hopeful', 'Joyful', 'Reflective', 'Anxious'],
            default: 'Peaceful',
        },
        section: {
            type: String,
            enum: ['wisdom', 'practices'],
            default: 'wisdom',
        },
        filename: {
            type: String,
            required: true,
        },
        thumbnailFilename: {
            type: String,
            default: '',
        },
        originalName: {
            type: String,
            default: '',
        },
        mimeType: {
            type: String,
            required: true,
        },
        size: {
            type: Number,
            default: 0,
        },
        durationSeconds: {
            type: Number,
            default: 0,
            min: 0,
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Auth',
            required: true,
            index: true,
        },
        teacherName: {
            type: String,
            trim: true,
            default: '',
        },
        viewCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        watchTimeSeconds: {
            type: Number,
            default: 0,
            min: 0,
        },
        sourceLocale: {
            type: String,
            default: 'en',
            trim: true,
        },
        translations: {
            type: Map,
            of: new mongoose.Schema(
                {
                    title: { type: String, trim: true, default: '' },
                    description: { type: String, trim: true, default: '' },
                    provider: { type: String, trim: true, default: '' },
                    updatedAt: { type: Date, default: Date.now },
                },
                { _id: false },
            ),
            default: {},
        },
        /** Relative path under uploads/hls, e.g. "{id}/master.m3u8" */
        hlsManifest: {
            type: String,
            default: '',
            trim: true,
        },
        transcodeStatus: {
            type: String,
            enum: ['pending', 'processing', 'ready', 'failed', 'skipped'],
            default: 'pending',
        },
        /** Speech-to-text subtitles (Whisper) */
        transcribeStatus: {
            type: String,
            enum: ['pending', 'processing', 'ready', 'failed', 'skipped'],
            default: 'pending',
        },
        transcribeError: {
            type: String,
            default: '',
            trim: true,
        },
    },
    { timestamps: true },
);

videoSchema.index({ createdAt: -1 });
videoSchema.index({ viewCount: -1 });

module.exports = mongoose.model('Video', videoSchema);
