const { body } = require('express-validator');
const { z } = require('zod');
const {
    pickField,
    isEmailIdentifier,
    isValidPhoneIdentifier,
    assertValidEmailIdentifier,
    normalizeIdentifierInput,
    validateEmailExpressValue,
    passwordField,
    loginPasswordField,
    emailField,
    otpField,
} = require('./shared');
const {
    strongPasswordExpressValidator,
    loginPasswordExpressValidator,
} = require('./passwordPolicy');

// --- Login ---
const loginBodySchema = z
    .object({
        identifier: z
            .string({ error: 'identifier (email or phone with country code) is required' })
            .trim()
            .min(1, 'identifier (email or phone with country code) is required'),
        password: loginPasswordField,
    })
    .superRefine((data, ctx) => {
        const { identifier } = data;
        if (isEmailIdentifier(identifier)) {
            assertValidEmailIdentifier(identifier, ctx, 'identifier');
            return;
        }
        if (!isValidPhoneIdentifier(identifier)) {
            ctx.addIssue({
                code: 'custom',
                message: 'Invalid phone format (use country code, e.g. +919876543210)',
                path: ['identifier'],
            });
        }
    })
    .transform((data) => ({
        ...data,
        identifier: normalizeIdentifierInput(data.identifier),
    }));

const loginExpressValidators = [
    body('identifier')
        .trim()
        .notEmpty()
        .withMessage('identifier (email or phone with country code) is required')
        .customSanitizer((value) => normalizeIdentifierInput(value))
        .custom((value) => {
            if (!String(value).includes('@')) return true;
            return validateEmailExpressValue(value);
        }),
    loginPasswordExpressValidator(),
];

function emailExpressValidators(fieldName = 'email') {
    return [
        body(fieldName)
            .trim()
            .notEmpty()
            .withMessage(`${fieldName} is required`)
            .normalizeEmail()
            .custom(validateEmailExpressValue),
    ];
}

// --- Register ---
const registerBodySchema = z
    .object({
        firstName: z.string({ error: 'firstName is required' }).trim().min(1, 'firstName is required'),
        lastName: z.string({ error: 'lastName is required' }).trim().min(1, 'lastName is required'),
        countryCode: z
            .string({ error: 'countryCode is required' })
            .trim()
            .min(1, 'countryCode is required'),
        mobileNumber: z
            .string({ error: 'mobileNumber is required' })
            .trim()
            .min(1, 'mobileNumber is required'),
        email: emailField,
        password: passwordField,
        confirmPassword: z.string().trim().optional(),
    })
    .superRefine((data, ctx) => {
        assertValidEmailIdentifier(data.email, ctx, 'email');
        const cc = String(data.countryCode).replace(/\D/g, '');
        const num = String(data.mobileNumber).replace(/\D/g, '');
        if (!cc || !num || cc.length > 4 || num.length < 6 || num.length > 14) {
            ctx.addIssue({
                code: 'custom',
                message: 'Invalid country code or mobile number',
                path: ['mobileNumber'],
            });
        }
        if (
            data.confirmPassword != null &&
            data.confirmPassword !== '' &&
            data.confirmPassword !== data.password
        ) {
            ctx.addIssue({
                code: 'custom',
                message: 'Passwords do not match',
                path: ['confirmPassword'],
            });
        }
    });

const registerExpressValidators = [
    body('firstName').trim().notEmpty().withMessage('firstName is required'),
    body('lastName').trim().notEmpty().withMessage('lastName is required'),
    body('countryCode').trim().notEmpty().withMessage('countryCode is required'),
    body('mobileNumber').trim().notEmpty().withMessage('mobileNumber is required'),
    ...emailExpressValidators('email'),
    strongPasswordExpressValidator('password'),
    body('confirmPassword')
        .optional()
        .custom((value, { req }) => {
            if (value == null || value === '') return true;
            return String(value) === String(req.body.password);
        })
        .withMessage('Passwords do not match'),
];

// --- Refresh token ---
const refreshTokenBodySchema = z.object({
    refreshToken: z
        .string({ error: 'refreshToken is required' })
        .trim()
        .min(32, 'refreshToken is required'),
});

const refreshTokenExpressValidators = [
    body('refreshToken').trim().notEmpty().withMessage('refreshToken is required'),
];

// --- Google ---
const googleBodySchema = z.object({
    idToken: z
        .string({ error: 'idToken is required' })
        .trim()
        .min(20, 'idToken is required'),
});

const googleExpressValidators = [
    body('idToken').trim().notEmpty().withMessage('idToken is required'),
];

// --- Email + OTP ---
const emailOtpBodySchema = z.object({
    email: emailField,
    otp: otpField,
});

const emailOtpExpressValidators = [
    ...emailExpressValidators('email'),
    body('otp')
        .trim()
        .notEmpty()
        .withMessage('otp is required')
        .matches(/^\d{6}$/)
        .withMessage('otp must be a 6-digit code'),
];

// --- Forgot password ---
const forgotPasswordBodySchema = z.object({
    email: emailField,
});

const forgotPasswordExpressValidators = emailExpressValidators('email');

// --- Reset password ---
const resetPasswordBodySchema = z.object({
    email: emailField,
    newPassword: passwordField,
});

const resetPasswordExpressValidators = [
    ...emailExpressValidators('email'),
    strongPasswordExpressValidator('newPassword'),
];

// --- Create profile (camelCase or PascalCase keys) ---
const optionalProfileString = z.union([z.string(), z.number()]).optional();

const createProfileBodySchema = z
    .object({
        firstName: optionalProfileString,
        FirstName: optionalProfileString,
        lastName: optionalProfileString,
        LastName: optionalProfileString,
        displayName: optionalProfileString,
        DisplayName: optionalProfileString,
        genderId: optionalProfileString,
        GenderId: optionalProfileString,
        bloodGroupId: optionalProfileString,
        BloodGroupId: optionalProfileString,
        dob: optionalProfileString,
        Dob: optionalProfileString,
        address: optionalProfileString,
        Address: optionalProfileString,
        city: optionalProfileString,
        City: optionalProfileString,
        cityId: optionalProfileString,
        CityId: optionalProfileString,
        state: optionalProfileString,
        State: optionalProfileString,
        stateId: optionalProfileString,
        StateId: optionalProfileString,
        country: optionalProfileString,
        Country: optionalProfileString,
        countryId: optionalProfileString,
        CountryId: optionalProfileString,
        pincode: optionalProfileString,
        Pincode: optionalProfileString,
        zipCode: optionalProfileString,
        ZipCode: optionalProfileString,
    })
    .passthrough()
    .superRefine((data, ctx) => {
        const required = [
            ['displayName', 'DisplayName', 'displayName (DisplayName) is required'],
            ['dob', 'Dob', 'dob (Dob) is required'],
            ['country', 'Country', 'country (Country) is required'],
            ['state', 'State', 'state (State) is required'],
            ['city', 'City', 'city (City) is required'],
        ];
        for (const [camel, pascal, message] of required) {
            if (!pickField(data, camel, pascal)) {
                ctx.addIssue({ code: 'custom', message, path: [camel] });
            }
        }
    });

const createProfileExpressValidators = [
    body('displayName').optional().trim().notEmpty(),
    body('DisplayName').optional().trim().notEmpty(),
    body('dob').optional().trim().notEmpty(),
    body('Dob').optional().trim().notEmpty(),
    body('country').optional().trim().notEmpty(),
    body('Country').optional().trim().notEmpty(),
    body('state').optional().trim().notEmpty(),
    body('State').optional().trim().notEmpty(),
    body('city').optional().trim().notEmpty(),
    body('City').optional().trim().notEmpty(),
    body().custom((_, { req }) => {
        const b = req.body || {};
        const hasDisplay = pickField(b, 'displayName', 'DisplayName');
        const hasDob = pickField(b, 'dob', 'Dob');
        const hasCountry = pickField(b, 'country', 'Country');
        const hasState = pickField(b, 'state', 'State');
        const hasCity = pickField(b, 'city', 'City');
        if (hasDisplay && hasDob && hasCountry && hasState && hasCity) return true;
        throw new Error(
            'displayName (DisplayName), dob (Dob), country (Country), state (State), and city (City) are required'
        );
    }),
];

module.exports = {
    loginBodySchema,
    loginExpressValidators,
    refreshTokenBodySchema,
    refreshTokenExpressValidators,
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
};
