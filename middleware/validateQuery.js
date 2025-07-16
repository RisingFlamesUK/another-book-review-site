// validateQuery.js
import { validateInput } from '../utils/utils.js';

/**
 * Express middleware to validate req.query fields using validateInput.
 * @param {string[]} requiredFields - List of expected query parameters to validate.
 */
export function validateQuery(requiredFields = []) {
    return (req, res, next) => {
        const input = {};
        for (const field of requiredFields) {
            if (req.query[field] !== undefined) {
                input[field] = req.query[field];
            }
        }

        const errors = validateInput(input);

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                errors,
            });
        }

        next();
    };
}