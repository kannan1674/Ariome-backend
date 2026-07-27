const { validationResult } = require('express-validator');

function handleExpressValidation(req, res, next) {
    const result = validationResult(req);
    if (!result.isEmpty()) {
        return res.status(400).json({
            message: 'Validation failed',
            errors: result.array().map((err) => ({
                field: err.path,
                message: err.msg,
            })),
        });
    }
    next();
}

function validateBody(schema) {
    return (req, res, next) => {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: 'Validation failed',
                errors: parsed.error.issues.map((issue) => ({
                    field: issue.path.length ? issue.path.join('.') : 'body',
                    message: issue.message,
                })),
            });
        }
        req.body = parsed.data;
        next();
    };
}

/** Chain: express-validator → Zod (same pattern as login). */
function buildValidation(expressValidators, schema) {
    return [...expressValidators, handleExpressValidation, validateBody(schema)];
}

module.exports = {
    handleExpressValidation,
    validateBody,
    buildValidation,
};
