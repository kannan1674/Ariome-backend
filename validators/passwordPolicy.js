const { z } = require('zod');

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const PASSWORD_POLICY_MESSAGE =
    'password must be 8–128 characters and include uppercase, lowercase, a number, and a special character';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/;

function isStrongPassword(value) {
    return typeof value === 'string' && PASSWORD_REGEX.test(value);
}

/** Register / reset — enforce complexity. */
const passwordField = z
    .string({ error: 'password is required' })
    .min(PASSWORD_MIN, PASSWORD_POLICY_MESSAGE)
    .max(PASSWORD_MAX, PASSWORD_POLICY_MESSAGE)
    .refine(isStrongPassword, { message: PASSWORD_POLICY_MESSAGE });

/** Login — verify against stored hash; do not require complexity on existing accounts. */
const loginPasswordField = z
    .string({ error: 'password is required' })
    .min(1, 'password is required')
    .max(PASSWORD_MAX, 'password must be at most 128 characters');

function strongPasswordExpressValidator(fieldName = 'password') {
    const { body } = require('express-validator');
    return body(fieldName)
        .notEmpty()
        .withMessage(`${fieldName} is required`)
        .isLength({ min: PASSWORD_MIN, max: PASSWORD_MAX })
        .withMessage(PASSWORD_POLICY_MESSAGE)
        .matches(PASSWORD_REGEX)
        .withMessage(PASSWORD_POLICY_MESSAGE);
}

function loginPasswordExpressValidator() {
    const { body } = require('express-validator');
    return body('password')
        .notEmpty()
        .withMessage('password is required')
        .isLength({ max: PASSWORD_MAX })
        .withMessage('password must be at most 128 characters');
}

module.exports = {
    PASSWORD_MIN,
    PASSWORD_MAX,
    PASSWORD_POLICY_MESSAGE,
    PASSWORD_REGEX,
    isStrongPassword,
    passwordField,
    loginPasswordField,
    strongPasswordExpressValidator,
    loginPasswordExpressValidator,
};
