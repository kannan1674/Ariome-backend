const express = require('express');
const {
    register,
    login,
    googleSignIn,
    verifyEmailOtp,
    forgotPassword,
    verifyResetPasswordOtp,
    resetPassword,
    getCountryCodes,
    createProfile,
    getProfile,
    refreshToken,
    getSession,
    logout,
} = require('../controller/authController');
const { protect } = require('../middleware/authMiddleware');
const { buildValidation } = require('../middleware/validateMiddleware');
const {
    loginBodySchema,
    loginExpressValidators,
    registerBodySchema,
    registerExpressValidators,
    googleBodySchema,
    googleExpressValidators,
    emailOtpBodySchema,
    emailOtpExpressValidators,
    forgotPasswordBodySchema,
    forgotPasswordExpressValidators,
    resetPasswordBodySchema,
    resetPasswordExpressValidators,
    createProfileBodySchema,
    createProfileExpressValidators,
    refreshTokenBodySchema,
    refreshTokenExpressValidators,
} = require('../validators/authValidators');
const {
    authRateLimiter,
    loginRateLimiter,
    sensitiveAuthRateLimiter,
} = require('../middleware/rateLimitMiddleware');

const router = express.Router();

const loginValidation = buildValidation(loginExpressValidators, loginBodySchema);
const registerValidation = buildValidation(registerExpressValidators, registerBodySchema);
const googleValidation = buildValidation(googleExpressValidators, googleBodySchema);
const emailOtpValidation = buildValidation(emailOtpExpressValidators, emailOtpBodySchema);
const forgotPasswordValidation = buildValidation(
    forgotPasswordExpressValidators,
    forgotPasswordBodySchema
);
const resetPasswordValidation = buildValidation(
    resetPasswordExpressValidators,
    resetPasswordBodySchema
);
const createProfileValidation = buildValidation(
    createProfileExpressValidators,
    createProfileBodySchema
);
const refreshTokenValidation = buildValidation(
    refreshTokenExpressValidators,
    refreshTokenBodySchema
);

router.get('/health', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.json({ ok: true });
    }
    res.json({
        ok: true,
        message: 'Auth API',
        get: ['/country-codes', '/session (Bearer JWT)', '/profile (Bearer JWT)'],
        post: [
            '/register',
            '/login',
            '/google',
            '/refresh-token',
            '/logout (Bearer JWT)',
            '/verify-email-otp',
            '/forgot-password',
            '/verify-reset-password-otp',
            '/reset-password',
            '/create-profile (Bearer JWT)',
        ],
    });
});

router.use(authRateLimiter);

router.post('/register', sensitiveAuthRateLimiter, registerValidation, register);
router.post('/login', loginRateLimiter, loginValidation, login);
router.post('/refresh-token', sensitiveAuthRateLimiter, refreshTokenValidation, refreshToken);
router.post('/google', sensitiveAuthRateLimiter, googleValidation, googleSignIn);
router.post('/verify-email-otp', sensitiveAuthRateLimiter, emailOtpValidation, verifyEmailOtp);
router.post('/forgot-password', sensitiveAuthRateLimiter, forgotPasswordValidation, forgotPassword);
router.post(
    '/verify-reset-password-otp',
    sensitiveAuthRateLimiter,
    emailOtpValidation,
    verifyResetPasswordOtp
);
router.post('/reset-password', sensitiveAuthRateLimiter, resetPasswordValidation, resetPassword);
router.get('/country-codes', getCountryCodes);
router.get('/session', protect, getSession);
router.get('/profile', protect, getProfile);
router.post('/logout', protect, logout);
router.post('/create-profile', protect, createProfileValidation, createProfile);

module.exports = router;
