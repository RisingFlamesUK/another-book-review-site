import {
    validateInput
} from '../utils/utils.js';

/**
 * Express middleware factory to validate req.body fields.
 *
 * @param {string[]} requiredFields - Fields that must be present.
 * @param {Object} [options] - Additional options.
 * @param {string[]} [options.optional] - Fields that are allowed but not required.
 */
export function validateBody(requiredFields = [], options = {}) {
    const optionalFields = options.optional || [];

    return (req, res, next) => {
        const errors = [];

        // Validate required fields
        for (const field of requiredFields) {
            if (!(field in req.body)) {
                errors.push(`${field} is required`);
            }
        }

        // Include both required and optional fields for validation (if present)
        const allFieldsToValidate = [...requiredFields];

        for (const field of optionalFields) {
            if (field in req.body) {
                allFieldsToValidate.push(field);
            }
        }

        // Only validate the fields that are actually in req.body
        const filteredInput = Object.fromEntries(
            allFieldsToValidate.map(field => [field, req.body[field]])
        );

        const validationErrors = validateInput(filteredInput);
        errors.push(...validationErrors);

        if (errors.length > 0) {
            const firstError = errors[0];

            const acceptsHtml = req.accepts(['html', 'json']) === 'html';
            const isLogin = req.path === '/login';
            const isSignup = req.path === '/signup';

            if (acceptsHtml && (isLogin || isSignup)) {
                const mode = isSignup ? 'signup' : 'login';
                const sessionKey = `${mode}Error`;

                req.session[sessionKey] = `${mode.charAt(0).toUpperCase() + mode.slice(1)} failed: ${firstError}`;
                req.session.signupMode = mode;
                const redirectTo = `/login-signup#${mode}`;

                return req.session.save(() => res.redirect(redirectTo));
            }

            return res.status(400).json({
                success: false,
                errors
            });
        }

        next();
    };
}
