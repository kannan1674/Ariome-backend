const ROLES = ['user', 'teacher', 'admin'];

/**
 * Restrict route to one or more roles. Use after `protect`.
 */
function authorize(...allowedRoles) {
    const normalized = allowedRoles.length ? allowedRoles : ROLES;

    return (req, res, next) => {
        const role = req.user?.role || 'user';
        if (!normalized.includes(role)) {
            return res.status(403).json({
                message: 'You do not have permission to perform this action.',
                code: 'FORBIDDEN_ROLE',
            });
        }
        return next();
    };
}

module.exports = { authorize, ROLES };
