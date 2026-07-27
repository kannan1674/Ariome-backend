const mongoose = require('mongoose');

const videoCommentSchema = new mongoose.Schema(
    {
        video: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Video',
            required: true,
            index: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Auth',
            required: true,
            index: true,
        },
        authorName: {
            type: String,
            trim: true,
            required: true,
            maxlength: 120,
        },
        text: {
            type: String,
            trim: true,
            required: true,
            maxlength: 1000,
        },
    },
    { timestamps: true },
);

videoCommentSchema.index({ video: 1, createdAt: -1 });

module.exports = mongoose.model('VideoComment', videoCommentSchema);
