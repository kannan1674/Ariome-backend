const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const authSchema = new mongoose.Schema(
    {
        firstName: {
            type: String,
            required: true,
            trim: true,
        },
        lastName: {
            type: String,
            required: true,
            trim: true,
        },
        phone: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        email: {
            type: String,
            sparse: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        /** Google OAuth subject (`sub` from ID token); set when user signs in or links Google. */
        googleId: {
            type: String,
            sparse: true,
            unique: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
            minlength: 8,
            select: false,
        },
        emailVerified: {
            type: Boolean,
            default: false,
        },
        emailOtpHash: {
            type: String,
            select: false,
        },
        emailOtpExpires: {
            type: Date,
            select: false,
        },
        resetPasswordOtpHash: {
            type: String,
            select: false,
        },
        resetPasswordOtpExpires: {
            type: Date,
            select: false,
        },
        resetPasswordOtpVerified: {
            type: Boolean,
            default: false,
            select: false,
        },
        /** Set when the user completes the extended profile (create-profile). */
        profileCompletedAt: {
            type: Date,
            default: null,
        },
        role: {
            type: String,
            enum: ['user', 'teacher', 'admin'],
            default: 'user',
            index: true,
        },
        profile: {
            displayName: { type: String, trim: true, default: '' },
            genderId: { type: String, trim: true, default: '' },
            bloodGroupId: { type: String, trim: true, default: '' },
            dob: { type: String, trim: true, default: '' },
            address: { type: String, trim: true, default: '' },
            city: { type: String, trim: true, default: '' },
            cityId: { type: String, trim: true, default: '' },
            state: { type: String, trim: true, default: '' },
            stateId: { type: String, trim: true, default: '' },
            country: { type: String, trim: true, default: '' },
            countryId: { type: String, trim: true, default: '' },
            pincode: { type: String, trim: true, default: '' },
        },
    },
    { timestamps: true }
);

authSchema.pre('save', async function hashPassword() {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

authSchema.methods.comparePassword = async function comparePassword(candidate) {
    return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('Auth', authSchema);
