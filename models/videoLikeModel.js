const mongoose = require('mongoose');

const videoLikeSchema = new mongoose.Schema(
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
    },
    { timestamps: true },
);

videoLikeSchema.index({ video: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('VideoLike', videoLikeSchema);
