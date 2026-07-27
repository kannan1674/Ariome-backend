const { z } = require('zod');

function pickField(data, ...keys) {
    for (const k of keys) {
        if (data[k] == null) continue;
        const s = String(data[k]).trim();
        if (s !== '') return s;
    }
    return '';
}

function isEmailIdentifier(value) {
    return typeof value === 'string' && value.includes('@');
}

/** Emails are case-insensitive — always store and compare lowercase. */
function normalizeEmailInput(value) {
    return String(value || '').trim().toLowerCase();
}

/** Lowercase email identifiers only; leave phone numbers unchanged. */
function normalizeIdentifierInput(value) {
    const trimmed = String(value || '').trim();
    return isEmailIdentifier(trimmed) ? trimmed.toLowerCase() : trimmed;
}

/** Exact mistyped domain → correct domain. */
const EMAIL_DOMAIN_TYPOS = {
    'gail.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'gmal.com': 'gmail.com',
    'gamil.com': 'gmail.com',
    'gnail.com': 'gmail.com',
    'yahooo.com': 'yahoo.com',
    'yaho.com': 'yahoo.com',
    'yaohoo.com': 'yahoo.com',
    'yaohoo.co': 'yahoo.com',
    'yaoo.com': 'yahoo.com',
    'yhaoo.com': 'yahoo.com',
    'yahho.com': 'yahoo.com',
    'hotmial.com': 'hotmail.com',
    'outlok.com': 'outlook.com',
};

/** Domains used for fuzzy typo detection (login/register). */
const POPULAR_EMAIL_DOMAINS = [
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'yahoo.co.in',
    'yahoo.in',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'icloud.com',
    'protonmail.com',
    'proton.me',
    'rediffmail.com',
    'aol.com',
    'zoho.com',
    'mail.com',
];

function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}

function getMaxTypoDistance(domainLength) {
    if (domainLength <= 6) return 1;
    if (domainLength <= 10) return 2;
    return 3;
}

function findSimilarPopularDomain(domain) {
    const d = domain.toLowerCase();
    if (POPULAR_EMAIL_DOMAINS.includes(d)) return null;
    if (EMAIL_DOMAIN_TYPOS[d]) return EMAIL_DOMAIN_TYPOS[d];

    let best = null;
    let bestDist = Infinity;

    for (const known of POPULAR_EMAIL_DOMAINS) {
        const dist = levenshtein(d, known);
        const maxDist = getMaxTypoDistance(Math.max(d.length, known.length));
        if (dist <= maxDist && dist < bestDist) {
            bestDist = dist;
            best = known;
        }
    }

    return bestDist <= getMaxTypoDistance(d.length) ? best : null;
}

function getEmailDomain(email) {
    const at = String(email || '').lastIndexOf('@');
    if (at === -1) return '';
    return String(email).slice(at + 1).toLowerCase().trim();
}

function getSuggestedDomain(email) {
    const domain = getEmailDomain(email);
    if (!domain) return null;
    return EMAIL_DOMAIN_TYPOS[domain] || findSimilarPopularDomain(domain);
}

function getEmailTypoMessage(email) {
    const normalized = normalizeEmailInput(email);
    const suggested = getSuggestedDomain(normalized);
    if (!suggested) return null;
    const domain = getEmailDomain(normalized);
    const local = normalized.slice(0, normalized.lastIndexOf('@'));
    return `Invalid email domain "${domain}". Did you mean ${local}@${suggested}?`;
}

function assertValidEmailIdentifier(identifier, ctx, fieldPath = 'identifier') {
    const normalized = normalizeEmailInput(identifier);
    const typoMsg = getEmailTypoMessage(normalized);
    if (typoMsg) {
        ctx.addIssue({ code: 'custom', message: typoMsg, path: [fieldPath] });
        return;
    }
    if (!z.email().safeParse(normalized).success) {
        ctx.addIssue({
            code: 'custom',
            message: 'Invalid email format',
            path: [fieldPath],
        });
    }
}

function isValidPhoneIdentifier(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
}

const { passwordField, loginPasswordField } = require('./passwordPolicy');

const emailField = z
    .string({ error: 'email is required' })
    .trim()
    .transform(normalizeEmailInput)
    .pipe(z.email({ error: 'Invalid email format' }));

const otpField = z
    .string({ error: 'otp is required' })
    .trim()
    .regex(/^\d{6}$/, 'otp must be a 6-digit code');

function validateEmailExpressValue(value) {
    const normalized = normalizeEmailInput(value);
    const typoMsg = getEmailTypoMessage(normalized);
    if (typoMsg) throw new Error(typoMsg);
    const { isEmail } = require('validator');
    if (!isEmail(normalized)) throw new Error('Invalid email format');
    return true;
}

module.exports = {
    pickField,
    isEmailIdentifier,
    isValidPhoneIdentifier,
    normalizeEmailInput,
    normalizeIdentifierInput,
    getEmailTypoMessage,
    assertValidEmailIdentifier,
    validateEmailExpressValue,
    passwordField,
    loginPasswordField,
    emailField,
    otpField,
};
