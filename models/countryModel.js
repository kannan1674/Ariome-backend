const mongoose = require('mongoose');

const countrySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        iso2: { type: String, required: true, uppercase: true, trim: true, unique: true },
        dialCode: { type: String, required: true, trim: true },
    },
    { timestamps: true }
);

countrySchema.index({ name: 1 });

module.exports = mongoose.model('Country', countrySchema);
