const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Auth',
            required: true,
            index: true,
        },
        refreshTokenHash: {
            type: String,
            required: true,
            unique: true,
            select: false,
        },
        /** Session info window — client should refresh before this (default 29 min). */
        sessionExpiresAt: {
            type: Date,
            required: true,
            index: true,
        },
        /** Refresh token validity (default 7 days). */
        refreshExpiresAt: {
            type: Date,
            required: true,
            index: true,
        },
        revoked: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Session', sessionSchema);
