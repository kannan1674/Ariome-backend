const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const authModel = require('../models/authModel');
const Country = require('../models/countryModel');
const {
    createAuthSession,
    refreshAuthSession,
    revokeSession,
} = require('../services/sessionService');
const {
    accountVerificationTemplate,
    forgotPasswordOtpTemplate,
} = require('../Email Templates/templates');
const { sendServerError } = require('../utils/apiError');

function toE164Phone(countryCode, mobileNumber) {
    const cc = String(countryCode || '').replace(/\D/g, '');
    const num = String(mobileNumber || '').replace(/\D/g, '');
    if (!cc || !num) return '';
    return `+${cc}${num}`;
}

function identifierToPhone(identifier) {
    const digits = String(identifier || '').replace(/\D/g, '');
    if (!digits) return '';
    return `+${digits}`;
}

function isEmail(str) {
    return typeof str === 'string' && str.includes('@');
}

const googleOAuthClient = new OAuth2Client();

async function sendAuthSuccess(res, user, statusCode = 200, extra = {}) {
    const auth = await createAuthSession(user._id);
    const body = {
        token: auth.accessToken,
        refreshToken: auth.refreshToken,
        session: auth.sessionMeta,
        user: userPublicJSON(user),
        ...extra,
    };
    return res.status(statusCode).json(body);
}

/** Unique E.164-style placeholder; not used for Google users to sign in with phone. */
function syntheticPhoneForGoogleSub(sub) {
    const digits = crypto
        .createHash('sha256')
        .update(`google:${sub}`)
        .digest('hex')
        .replace(/\D/g, '');
    const pad = (digits + '00000000000000').slice(0, 14);
    return `+900${pad}`;
}

function createOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

const FORGOT_PASSWORD_GENERIC_MESSAGE =
    'If an account exists with this email, a password reset OTP has been sent.';

function hashOtp(otp) {
    return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function getTransporter() {
    const host = String(process.env.SMTP_SERVER || '').trim();
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASSWORD || '').trim();

    if (!host || !user || !pass) {
        throw new Error('SMTP_SERVER, SMTP_USER, and SMTP_PASSWORD are required');
    }

    const normalizedHost = host.toLowerCase();
    const isGmail =
        normalizedHost === 'gmail' ||
        normalizedHost === 'gmail.com' ||
        normalizedHost === 'smtp.gmail.com';
    const smtpHost = isGmail ? 'smtp.gmail.com' : host;
    const smtpPort = Number(process.env.SMTP_PORT) || (isGmail ? 465 : 587);
    const smtpSecure =
        process.env.SMTP_SECURE != null
            ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
            : smtpPort === 465;
    const smtpPass = isGmail ? pass.replace(/\s+/g, '') : pass;

    return nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user, pass: smtpPass },
    });
}

const register = async (req, res) => {
    try {
        const { firstName, lastName, countryCode, mobileNumber, email, password } = req.body;

        const phone = toE164Phone(countryCode, mobileNumber);
        const payload = {
            firstName,
            lastName,
            phone,
            password,
            email,
        };

        const user = await authModel.create(payload);
        const otp = createOtp();
        const otpHash = hashOtp(otp);
        const otpExpireAt = new Date(Date.now() + 10 * 60 * 1000);

        await authModel.findByIdAndUpdate(user._id, {
            emailOtpHash: otpHash,
            emailOtpExpires: otpExpireAt,
            emailVerified: false,
        });

        const transporter = getTransporter();
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: user.email,
            subject: 'Verify your Ariome account',
            html: accountVerificationTemplate({
                firstName: user.firstName,
                otp,
            }),
        });

        return sendAuthSuccess(res, user, 201, {
            message: 'Registered successfully. Verification OTP has been sent to your email.',
        });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] || 'field';
            return res.status(409).json({ message: `${field} is already registered` });
        }
        return sendServerError(res, 500, 'Registration failed', err);
    }
};

const login = async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const raw = String(identifier).trim();
        const emailLookup = isEmail(raw) ? raw.toLowerCase() : raw;
        let user;

        if (isEmail(raw)) {
            user = await authModel.findOne({ email: emailLookup }).select('+password');
        } else {
            const phone = identifierToPhone(raw);
            if (!phone || phone === '+') {
                return res.status(400).json({ message: 'Invalid phone format' });
            }
            user = await authModel.findOne({ phone }).select('+password');
        }

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const ok = await user.comparePassword(password);
        if (!ok) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!user.emailVerified) {
            return res.status(403).json({
                message: 'Please verify your email before logging in. Check your inbox for the OTP.',
                code: 'EMAIL_NOT_VERIFIED',
            });
        }

        return sendAuthSuccess(res, user);
    } catch (err) {
        return sendServerError(res, 500, 'Login failed', err);
    }
};

const googleSignIn = async (req, res) => {
    try {
        let clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
        if (!clientId) {
            const dotenv = require('dotenv');
            const path = require('path');
            dotenv.config({ path: path.resolve(__dirname, '../config/config.env') });
            dotenv.config({ path: path.resolve(__dirname, '../.env') });
            clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
        }
        if (!clientId) {
            return res.status(503).json({
                message:
                    'Google sign-in is not configured (set GOOGLE_CLIENT_ID in Backend/config/config.env or Backend/.env and restart the API)',
            });
        }

        const { idToken } = req.body;

        let ticket;
        try {
            ticket = await googleOAuthClient.verifyIdToken({
                idToken: idToken.trim(),
                audience: clientId,
            });
        } catch {
            return res.status(401).json({ message: 'Invalid or expired Google token' });
        }

        const payload = ticket.getPayload();
        if (!payload?.email) {
            return res.status(401).json({ message: 'Google account has no email' });
        }
        if (payload.email_verified !== true) {
            return res.status(401).json({ message: 'Google email must be verified' });
        }

        const sub = String(payload.sub);
        const email = String(payload.email).toLowerCase().trim();
        const given = String(payload.given_name || '').trim();
        const family = String(payload.family_name || '').trim();
        const fullName = String(payload.name || '').trim();
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        const firstName = given || nameParts[0] || 'User';
        const lastName = family || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '') || ' ';

        let user = await authModel.findOne({ googleId: sub });
        if (!user) {
            user = await authModel.findOne({ email });
        }

        if (user) {
            if (user.googleId && user.googleId !== sub) {
                return res.status(409).json({
                    message: 'This email is already linked to a different Google account',
                });
            }
            if (!user.googleId) {
                user.googleId = sub;
                user.emailVerified = true;
                await user.save();
            }

            return sendAuthSuccess(res, user);
        }

        const phone = syntheticPhoneForGoogleSub(sub);
        const randomPassword = crypto.randomBytes(48).toString('base64url');

        try {
            user = await authModel.create({
                firstName,
                lastName,
                phone,
                email,
                password: randomPassword,
                googleId: sub,
                emailVerified: true,
            });
        } catch (err) {
            if (err.code === 11000) {
                const field = Object.keys(err.keyPattern || {})[0] || 'field';
                return res.status(409).json({ message: `${field} is already registered` });
            }
            throw err;
        }

        return sendAuthSuccess(res, user, 201);
    } catch (err) {
        return sendServerError(res, 500, 'Google sign-in failed', err);
    }
};

const refreshToken = async (req, res) => {
    try {
        const { refreshToken: token } = req.body;
        const result = await refreshAuthSession(token);

        if (result.error) {
            const messages = {
                INVALID_REFRESH_TOKEN: 'Invalid or revoked refresh token',
                REFRESH_TOKEN_EXPIRED: 'Refresh token expired. Please login again.',
            };
            return res.status(result.status).json({
                message: messages[result.error] || 'Refresh failed',
                code: result.error,
            });
        }

        const user = await authModel.findById(result.session.userId).select('-password');
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        return res.json({
            message: 'Token refreshed successfully',
            token: result.accessToken,
            refreshToken: result.refreshToken,
            session: result.sessionMeta,
            user: userPublicJSON(user),
        });
    } catch (err) {
        return sendServerError(res, 500, 'Refresh token failed', err);
    }
};

const getSession = async (req, res) => {
    try {
        return res.json({
            session: req.sessionMeta,
            user: userPublicJSON(req.user),
        });
    } catch (err) {
        return sendServerError(res, 500, 'Get session failed', err);
    }
};

const logout = async (req, res) => {
    try {
        if (req.session?._id) {
            await revokeSession(req.session._id);
        }
        return res.json({ message: 'Logged out successfully' });
    } catch (err) {
        return sendServerError(res, 500, 'Logout failed', err);
    }
};

const verifyEmailOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const normalizedEmail = email;
        const otpHash = hashOtp(otp);

        const user = await authModel
            .findOne({ email: normalizedEmail })
            .select('+emailOtpHash +emailOtpExpires');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.emailOtpHash || !user.emailOtpExpires || user.emailOtpExpires < new Date()) {
            return res.status(400).json({ message: 'OTP expired. Please request a new OTP.' });
        }

        if (user.emailOtpHash !== otpHash) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        user.emailVerified = true;
        user.emailOtpHash = undefined;
        user.emailOtpExpires = undefined;
        await user.save();

        return res.json({ message: 'Email verified successfully' });
    } catch (err) {
        return sendServerError(res, 500, 'Email verification failed', err);
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = email;
        const user = await authModel.findOne({ email: normalizedEmail });
        if (user) {
            const otp = createOtp();
            const otpHash = hashOtp(otp);
            const otpExpireAt = new Date(Date.now() + 10 * 60 * 1000);

            await authModel.findByIdAndUpdate(user._id, {
                resetPasswordOtpHash: otpHash,
                resetPasswordOtpExpires: otpExpireAt,
                resetPasswordOtpVerified: false,
            });

            const transporter = getTransporter();
            await transporter.sendMail({
                from: process.env.SMTP_USER,
                to: user.email,
                subject: 'Reset your Ariome password',
                html: forgotPasswordOtpTemplate({
                    firstName: user.firstName,
                    otp,
                }),
            });

            if (process.env.NODE_ENV !== 'production') {
                console.log(
                    `[dev] Password reset OTP for ${user.email}: ${otp} (expires in 10 min)`,
                );
            }
        } else if (process.env.NODE_ENV !== 'production') {
            console.log(`[dev] Forgot password: no account for ${normalizedEmail}`);
        }

        return res.json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
    } catch (err) {
        return sendServerError(res, 500, 'Forgot password failed', err);
    }
};

const verifyResetPasswordOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const normalizedEmail = email;
        const otpHash = hashOtp(otp);

        const user = await authModel
            .findOne({ email: normalizedEmail })
            .select('+resetPasswordOtpHash +resetPasswordOtpExpires +resetPasswordOtpVerified');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (
            !user.resetPasswordOtpHash ||
            !user.resetPasswordOtpExpires ||
            user.resetPasswordOtpExpires < new Date()
        ) {
            return res.status(400).json({ message: 'OTP expired. Please request a new OTP.' });
        }

        if (user.resetPasswordOtpHash !== otpHash) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        user.resetPasswordOtpVerified = true;
        await user.save();

        return res.json({ message: 'OTP verified successfully' });
    } catch (err) {
        return sendServerError(res, 500, 'Reset OTP verification failed', err);
    }
};

const resetPassword = async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        const normalizedEmail = email;
        const user = await authModel
            .findOne({ email: normalizedEmail })
            .select('+resetPasswordOtpExpires +resetPasswordOtpVerified +password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (
            !user.resetPasswordOtpVerified ||
            !user.resetPasswordOtpExpires ||
            user.resetPasswordOtpExpires < new Date()
        ) {
            return res.status(400).json({
                message: 'Verify reset OTP first and complete reset within OTP validity',
            });
        }

        user.password = String(newPassword);
        user.resetPasswordOtpHash = undefined;
        user.resetPasswordOtpExpires = undefined;
        user.resetPasswordOtpVerified = false;
        await user.save();

        return res.json({ message: 'Password reset successful' });
    } catch (err) {
        return sendServerError(res, 500, 'Reset password failed', err);
    }
};

const getCountryCodes = async (req, res) => {
    try {
        const countryCodes = await Country.find({})
            .select('name iso2 dialCode -_id')
            .sort({ name: 1 })
            .lean();

        return res.json({
            count: countryCodes.length,
            countryCodes,
        });
    } catch (err) {
        return sendServerError(res, 500, 'Failed to load country codes', err);
    }
};

function pickTrimmed(body, ...keys) {
    for (const k of keys) {
        if (body[k] == null) continue;
        const s = String(body[k]).trim();
        if (s !== '') return s;
    }
    return '';
}

/**
 * Normalize profile fields from JSON (camelCase or PascalCase).
 */
function readProfilePayload(body) {
    const b = body && typeof body === 'object' ? body : {};
    return {
        firstName: pickTrimmed(b, 'firstName', 'FirstName'),
        lastName: pickTrimmed(b, 'lastName', 'LastName'),
        displayName: pickTrimmed(b, 'displayName', 'DisplayName'),
        genderId: pickTrimmed(b, 'genderId', 'GenderId'),
        bloodGroupId: pickTrimmed(b, 'bloodGroupId', 'BloodGroupId'),
        dob: pickTrimmed(b, 'dob', 'Dob'),
        address: pickTrimmed(b, 'address', 'Address'),
        city: pickTrimmed(b, 'city', 'City'),
        cityId: pickTrimmed(b, 'cityId', 'CityId'),
        state: pickTrimmed(b, 'state', 'State'),
        stateId: pickTrimmed(b, 'stateId', 'StateId'),
        country: pickTrimmed(b, 'country', 'Country'),
        countryId: pickTrimmed(b, 'countryId', 'CountryId'),
        pincode: pickTrimmed(b, 'pincode', 'Pincode', 'zipCode', 'ZipCode'),
    };
}

function userPublicJSON(user) {
    return {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        email: user.email || null,
        emailVerified: user.emailVerified,
        role: user.role || 'user',
        profile: user.profile || {},
        profileCompletedAt: user.profileCompletedAt || null,
    };
}

/**
 * GET /api/auth/profile
 * Bearer JWT required. Returns account + extended profile fields.
 */
const getProfile = async (req, res) => {
    try {
        const user = await authModel.findById(req.userId).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        return res.json({ user: userPublicJSON(user) });
    } catch (err) {
        return sendServerError(res, 500, 'Get profile failed', err);
    }
};

/**
 * POST /api/auth/create-profile
 * Bearer JWT required. One-time extended profile after registration.
 */
const createProfile = async (req, res) => {
    try {
        const user = await authModel.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.profileCompletedAt) {
            return res.status(409).json({
                message: 'Profile already exists. Use your profile update endpoint instead.',
            });
        }

        const p = readProfilePayload(req.body);

        if (p.firstName) user.firstName = p.firstName;
        if (p.lastName) user.lastName = p.lastName;

        if (!user.firstName || !user.lastName) {
            return res.status(400).json({
                message: 'firstName and lastName are required on the account (send FirstName/LastName or complete registration)',
            });
        }

        user.profile = user.profile || {};
        user.profile.displayName = p.displayName;
        user.profile.genderId = p.genderId;
        user.profile.bloodGroupId = p.bloodGroupId;
        user.profile.dob = p.dob;
        user.profile.address = p.address;
        user.profile.city = p.city;
        user.profile.cityId = p.cityId;
        user.profile.state = p.state;
        user.profile.stateId = p.stateId;
        user.profile.country = p.country;
        user.profile.countryId = p.countryId;
        user.profile.pincode = p.pincode;

        user.profileCompletedAt = new Date();
        user.markModified('profile');
        await user.save();

        const fresh = await authModel.findById(user._id).select('-password');
        return res.status(201).json({
            message: 'Profile created successfully',
            user: userPublicJSON(fresh),
        });
    } catch (err) {
        return sendServerError(res, 500, 'Create profile failed', err);
    }
};

module.exports = {
    register,
    login,
    googleSignIn,
    refreshToken,
    getSession,
    logout,
    verifyEmailOtp,
    forgotPassword,
    verifyResetPasswordOtp,
    resetPassword,
    getCountryCodes,
    createProfile,
    getProfile,
};
