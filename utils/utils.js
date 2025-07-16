// This file is /utils/utilsjs
import EmailValidation from 'emailvalid';
import {
    cachedLanguages,
    findUser,
} from './db-handler.js';

/**
 * Looks up language information from the cachedLanguages Map.
 *
 * @param {string} type - The property to match against ('key', 'language', 'id').
 * @param {string | number | Array<string | number>} data - The value(s) to look for.
 * Can be a single string/number or an array of strings/numbers.
 * @param {string} [returnProperty='all'] - The property to return from the found language object.
 * Can be 'key', 'language', 'id', or 'all' (default, returns the full object).
 * @returns {Object | string | number | Array<Object | string | number | undefined> | undefined}
 * - If `data` is a single value: returns the specified property or the full object, or `undefined` if not found.
 * - If `data` is an array: returns an array of the specified properties or full objects,
 * with `undefined` for items not found.
 */
export function languageLookup(type, data, returnProperty = 'all') {
    // Helper function to extract the desired property from a found language object
    const getDesiredValue = (languageObj) => {
        if (!languageObj) {
            return undefined; // If no language object is found, return undefined
        }

        switch (returnProperty) {
            case 'key':
                return languageObj.key;
            case 'language':
                return languageObj.language;
            case 'id':
                return languageObj.id;
            case 'all':
            default: // Default case and if returnProperty is not recognized
                return languageObj;
        }
    };

    // Helper function to perform the actual lookup based on type
    const performSingleLookup = (lookupValue) => {
        if (type === 'key') {
            const formattedKeysArray = formatPrefix('languages', [{
                key: String(lookupValue)
            }]);
            const keyToLookup = formattedKeysArray.length > 0 ? formattedKeysArray[0] : null;
            if (keyToLookup) {
                let found = cachedLanguages.get(keyToLookup);
                if (found) {
                    return found;
                }
            }

            return undefined;;
        } else {

            for (const lang of cachedLanguages.values()) {
                switch (type) {
                    case 'language':
                        if (lang.language.toLowerCase() === String(lookupValue).toLowerCase()) {
                            return lang;
                        }
                        break;
                    case 'id':
                        if (lang.id == lookupValue) {
                            return lang;
                        }
                        break;
                    default:
                        console.warn(`languageLookup: Unsupported lookup type "${type}".`);
                        return undefined; // Return undefined for unsupported types
                }
            }
            return undefined; // No language found after iterating
        }
    };

    if (Array.isArray(data)) {
        // If data is an array, map over it to perform lookups for each item
        return data.map(item => getDesiredValue(performSingleLookup(item)));
    } else {
        // If data is a single value, perform a single lookup
        const foundLanguage = performSingleLookup(data);
        return getDesiredValue(foundLanguage);
    }
}

/**
 * Helper function to extract the clean identifier (the part after the prefix)
 * from OpenLibrary API 'key' strings or directly provided OLIDs.
 * This function is designed to handle various input formats from Open Library API responses
 * (single string, array of strings, array of objects with 'key', nested objects with 'key', etc.)
 * and consistently return the core identifier in the format used internally by the application.
 *
 * @param {string} type - The type of identifier to format ('languages', 'works', 'authors', 'edition').
 * @param {any} data - The raw input data, which can be:
 * - A string (e.g., "/works/OL123W", "OL123W")
 * - An object (e.g., { key: "/works/OL123W" }, { author: { key: "/authors/OL456A" } })
 * - An array of strings or objects (e.g., [{ key: "/languages/eng" }], ["OL123W"], [{ author: { key: "/authors/OL456A" } }])
 * @returns {Array<string> | string | null} An array of extracted identifiers for 'languages' or 'authors',
 * a single string for 'works' or 'edition', or null/empty array for invalid input.
 */
export function formatPrefix(type, data) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
        // Return null for single-item types (works, edition), empty array for multi-item types (languages, authors)
        return (type === 'works' || type === 'edition') ? null : [];
    }

    const prefixes = {
        'languages': '/languages/',
        'works': '/works/',
        'edition': '/books/', // Open Library uses /books/ for editions in their keys
        'authors': '/authors/'
    };

    const prefix = prefixes[type];
    if (prefix === undefined) {
        console.warn(`formatPrefix: Unsupported type "${type}". Attempting to extract last segment.`);
        // Fallback for unrecognized types: try to extract last segment from string or object.key
        if (typeof data === 'string') {
            return data.split('/').pop();
        } else if (data && typeof data.key === 'string') {
            return data.key.split('/').pop();
        } else if (Array.isArray(data)) {
            return data.map(item => {
                if (typeof item === 'string') return item.split('/').pop();
                if (item && typeof item.key === 'string') return item.key.split('/').pop();
                return null;
            }).filter(Boolean);
        }
        return null;
    }

    // Helper to extract a single ID from various formats
    const extractSingleId = (item) => {
        let keyToProcess = null;

        if (typeof item === 'string') {
            keyToProcess = item; // Case 1: Already a string (e.g., "OL123W", "/works/OL123W", "eng")
        } else if (item && typeof item.key === 'string') {
            keyToProcess = item.key; // Case 2: OL object with direct 'key' property (e.g., { key: "/works/OL123W" })
        } else if (item && item.author && typeof item.author.key === 'string' && type === 'authors') {
            keyToProcess = item.author.key; // Case 3: OL object with nested 'author.key' (specific to authors)
        } else if (item && typeof item.author_olid === 'string' && type === 'authors') {
            keyToProcess = item.author_olid; // Case 4: DB author object with 'author_olid' (though formatPrefix typically takes OL API output)
        }
        // Add more specific cases for other types if needed (e.g., edition could have {edition_olid: "OL123M"})

        if (keyToProcess) {
            // If it's already a clean OLID (doesn't start with '/'), return it directly
            if (!keyToProcess.startsWith('/')) {
                return keyToProcess;
            }
            // If it starts with the expected prefix, remove the prefix
            else if (keyToProcess.startsWith(prefix)) {
                return keyToProcess.substring(prefix.length);
            }
            // Fallback: if it's a path but doesn't match the prefix, take the last segment
            else if (keyToProcess.includes('/')) {
                console.warn(`formatPrefix: Key "${keyToProcess}" does not start with expected prefix "${prefix}" for type "${type}". Extracting last segment.`);
                return keyToProcess.split('/').pop();
            }
        }
        return null; // Return null if unable to extract a valid key
    };

    // Determine if the expected output is a single string or an array of strings
    if (type === 'works' || type === 'edition') {
        // These types typically expect a single OLID as output.
        // Data can be a single object/string or an array containing one item.
        const item = Array.isArray(data) ? data[0] : data;
        return extractSingleId(item);
    } else if (type === 'languages' || type === 'authors') {
        // These types typically expect an array of OLIDs/codes as output.
        // Ensure 'data' is treated as an array.
        const dataArray = Array.isArray(data) ? data : (data ? [data] : []);
        const transformedIds = dataArray.map(extractSingleId).filter(Boolean);
        return transformedIds;
    }

    return null; // Should not be reached given the switch and if conditions, but as a fallback
}

export async function validateUser(username, password, email = null, newUser = false) {
    const errors = [];

    // Step 1: Synchronous input validation
    const fieldsToValidate = {
        username,
        password
    };
    if (newUser && email) fieldsToValidate.email = email;

    const baseErrors = validateInput(fieldsToValidate);
    for (const message of baseErrors) {
        const field = message.split(' ')[0];
        errors.push({
            field,
            message
        });
    }

    // Step 2: Kick off async validators in parallel
    const asyncChecks = [];

    if (newUser && email) {
        asyncChecks.push(
            validateEmail(email)
            .then(err => err ? {
                field: 'email',
                message: err.message
            } : null)
            .catch(err => ({
                field: 'email',
                message: err.message
            }))
        );
    }

    if (username) {
        asyncChecks.push(
            validateUsername(username, newUser)
            .then(err => err ? {
                field: 'username',
                message: err.message
            } : null)
            .catch(err => ({
                field: 'username',
                message: err.message
            }))
        );
    }

    if (password) {
        asyncChecks.push(
            validatePassword(password)
            .then(err => err ? {
                field: 'password',
                message: err.message
            } : null)
            .catch(err => ({
                field: 'password',
                message: err.message
            }))
        );
    }

    // Step 3: Execute all async validations without aborting early
    const results = await Promise.allSettled(asyncChecks);

    results.forEach(settled => {
        if (settled.status === 'fulfilled' && settled.value) {
            errors.push(settled.value);
        } else if (settled.status === 'rejected') {
            // Unexpected failure in validator
            errors.push({
                field: 'validation',
                message: settled.reason.message || 'Validation error'
            });
        }
    });

    return errors.length > 0 ? errors : null;
}

async function validateUsername(username, newUser = false) {
    try {
        //check if the user exists already (if we're checking for a new user)
        if (newUser) {
            const existingUserByUsername = await findUser("username", username);
            if (existingUserByUsername) {
                const error = new Error(`User: "${username}" already exists`);
                error.statusCode = 400;
                throw error;
            };
        }

        //check the username is at minimum length
        if (username.length < 4) {
            const error = new Error('username must be at least 4 characters long');
            error.statusCode = 400;
            throw error;
        }

        return null;

    } catch (error) {
        return error;
    }
}



/**
 * Checks a string to ensure it's in a valid Open Library ID (OLID) format,
 * and returns the type of OLID if valid.
 * A valid OLID starts with "OL", followed by one or more digits,
 * and ends with either "M" (Multi-work/Edition), "W" (Work), or "A" (Author).
 *
 * @param {string} text - The string to validate as an OLID.
 * @returns {('edition'|'work'|'author')} - Returns 'edition', 'work', or 'author' if the string is a valid OLID.
 * @throws {Error} - Throws an error with a descriptive message if the OLID is invalid or if the type cannot be determined.
 */
export function validateOlid(text) {
    if (typeof text !== 'string' || text.length < 4) {
        throw new Error('Invalid OLID: Input must be a string and at least 4 characters long.');
    }

    // Regular expression for OLID format:
    // ^      : Start of the string
    // OL     : Must start with "OL"
    // \d+    : Must be followed by one or more digits (0-9)
    // [MWA]  : Must end with a single character that is 'M', 'W', or 'A'
    // $      : End of the string
    const olidRegex = /^OL\d+[MWA]$/;

    // Test if the text matches the OLID pattern
    if (!olidRegex.test(text)) {
        throw new Error('Invalid OLID. OLIDs must be in the format "OL" followed by digits, and ending with "M", "W", or "A" (e.g., "OL12345M", "OL6789W", "OL123A").');
    }

    // If validation passes, extract the last character to determine the type
    const olidTypeChar = text.slice(-1);

    switch (olidTypeChar) {
        case 'M':
            return 'edition';
        case 'W':
            return 'work';
        case 'A':
            return 'author';
        default:
            // This case should theoretically not be reached if the regex is correct,
            // but it acts as a safeguard.
            throw new Error('Internal error: Could not determine OLID type from valid OLID format character.');
    }
}

/**
 * Validate input fields and return a list of error messages.
 * @param {Object} input - Key-value pairs of fields to validate.
 * @returns {string[]} - Array of validation error messages.
 */
export function validateInput(input) {
    const errors = [];

    for (const [field, value] of Object.entries(input)) {
        switch (field) {
            // --- OLIDs ---
            case 'edition_olid':
            case 'work_olid':
            case 'author_olid':
                try {
                    const type = validateOlid(value);
                    const expected = field.replace('_olid', '');
                    if (type !== expected) {
                        errors.push(`${field} must be a valid ${expected} OLID.`);
                    }
                } catch (e) {
                    errors.push(`Invalid ${field}: ${e.message}`);
                }
                break;

                // --- Review fields ---
            case 'score':
                if (
                    !(
                        value === undefined ||
                        value === null ||
                        (Number.isInteger(value) && value >= 1 && value <= 5)
                    )
                ) {
                    errors.push('Score must be an integer between 1 and 5, or null/undefined.');
                }
                break;

            case 'review':
            case 'review_title':
            case 'initialReview':
            case 'initialTitle':
                if (
                    !(
                        value === undefined ||
                        value === null ||
                        typeof value === 'string'
                    )
                ) {
                    errors.push(`${field} must be a string, null, or undefined.`);
                }
                break;
            case 'initialScore':
                if (
                    value !== undefined &&
                    value !== null &&
                    (!Number.isInteger(value) || value < 0 || value > 5)
                ) {
                    errors.push('initialScore must be an integer between 0 and 5, or null/undefined.');
                }
                break;
            case 'reviewId':
                if (value !== undefined && typeof value !== 'string') {
                    errors.push('reviewId must be a string if provided.');
                }
                break;

                // --- Auth fields ---
            case 'username':
                if (!value || typeof value !== 'string' || value.length < 4) {
                    errors.push('username must be a valid string of at least 4 characters.');
                }
                break;

            case 'email':
                if (!value || typeof value !== 'string' || value.length < 5) {
                    errors.push('email must be a valid string of at least 5 characters.');
                }
                break;

            case 'password':
                if (!value || typeof value !== 'string' || value.length < 8) {
                    errors.push('password must be at least 8 characters long.');
                }
                break;

                // --- Metadata fields ---
            case 'title':
                if (value && (typeof value !== 'string' || value.trim() === '' || value.length > 150)) {
                    errors.push('Title must be a non-empty string under 150 characters.');
                }
                break;

            case 'description':
                if (value && (typeof value !== 'string' || value.length > 5000)) {
                    errors.push('Description must be a string under 5000 characters.');
                }
                break;

            case 'author_name':
            case 'work_title':
                if (value && (typeof value !== 'string' || value.trim() === '' || value.length > 100)) {
                    errors.push(`${field} must be a non-empty string under 100 characters.`);
                }
                break;

                // --- Language ---
            case 'languages':
                if (!Array.isArray(value)) {
                    errors.push(`languages must be an array.`);
                } else {
                    for (const lang of value) {
                        if (!languageLookup('key', lang) && !languageLookup('value', lang)) {
                            errors.push(`Language '${lang}' is not recognized.`);
                        }
                    }
                }
                break;
            case 'language':
                if (value !== undefined) {
                    if (!languageLookup('key', value) && !languageLookup('value', value)) {
                        errors.push(`Language '${value}' is not recognized.`);
                    }
                }
                break;
                // --- Boolean flags ---
            case 'is_primary':
            case 'is_favorite':
                if (value !== undefined && typeof value !== 'boolean') {
                    errors.push(`${field} must be a boolean (true or false).`);
                }
                break;

                // --- URL fields ---
            case 'cover_url':
                if (value && (typeof value !== 'string' || !value.startsWith('http'))) {
                    errors.push('cover_url must be a valid URL starting with http/https.');
                }
                break;
            case 'type': {
                const allowed = ['search', 'work-search', 'edition', 'author', 'works', 'work_editions', 'languages', 'trending', 'subject'];
                if (!allowed.includes(value)) {
                    errors.push(`type must be one of: ${allowed.join(', ')}.`);
                }
                break;
            }

            case 'criteria': {
                const t = input.type;
                if (['search', 'work-search', 'edition', 'author', 'works', 'subject', 'work_editions'].includes(t)) {
                    if (!value || typeof value !== 'string') {
                        errors.push(`criteria is required and must be a string for type '${t}'.`);
                    } else if (['edition', 'author', 'works', 'work_editions'].includes(t)) {
                        // must be OLID
                        try {
                            const olidType = validateOlid(value);
                            const expected = t === 'works' ? 'work' : t === 'work_editions' ? 'work' : t;
                            if (olidType !== expected) {
                                errors.push(`criteria must be a valid ${expected} OLID.`);
                            }
                        } catch (e) {
                            errors.push(`Invalid criteria OLID: ${e.message}`);
                        }
                    }
                }
                break;
            }

            case 'trending':
                if (req.body.type === 'trending') {
                    const allowedT = ['hourly', 'daily', 'weekly', 'monthly'];
                    if (!allowedT.includes(input.criteria)) {
                        errors.push(`For type trending, criteria must be one of: ${allowedT.join(', ')}`);
                    }
                }
                break;

            case 'page':
            case 'limit':
                if (value !== undefined) {
                    const n = Number(value);
                    if (!Number.isInteger(n) || n < 1) {
                        errors.push(`${field} must be a positive integer.`);
                    }
                }
                break;

                // --- Fallback ---
            default:
                if (!['returnTo', 'confirmPassword'].includes(field)) {
                    errors.push(`Unknown field: ${field}`);
                }
        }
    }

    if (errors.length > 0) {
        console.warn('[Validation Error]', {
            input,
            errors
        });
    }

    return errors;
}

async function validateEmail(email) {
    try {
        //convert email to lower case
        email = email.toLowerCase();

        //check if the email address is valid    
        const ev = new EmailValidation()

        //**** ev.setOptions({ allowDisposable: false, blacklist: ['baddomain.com'] }); **** Optionally invalidate disposible and add a blacklist
        ev.setOptions({
            allowDisposable: false,
            allowFreemail: true
        })

        const validEmail = ev.check(email);
        if (!validEmail.valid) {
            const error = new Error(`${validEmail.errors} email address`);
            error.statusCode = 400;
            throw error;
        };

        //check if the email address is already used for a user account
        const existingUserByEmail = await findUser("email", email);

        if (existingUserByEmail) {
            const error = new Error(`${email} already has an account`);
            error.statusCode = 400;
            throw error;
        }

        return null;

    } catch (error) {
        return error;
    }
}

async function validatePassword(password) {
    try {
        //check the password is at minimum length
        if (password.length < 8) {
            const error = new Error('Password must be at least 8 characters long');
            error.statusCode = 400;
            throw error;
        }

        // toDo: add other criteria e.g meets min strength
        return null;

    } catch (error) {
        return error;
    }
}

export function getReturnToUrl(req) {
    let returnTo = '/books'; // Default fallback path if no specific referrer is found

    if (req.headers.referer &&
        !req.headers.referer.includes('/login-signup') &&
        !req.headers.referer.includes('/login') &&
        !req.headers.referer.includes('/signup') &&
        !req.headers.referer.includes('/logout')) {
        try {
            const refererUrl = new URL(req.headers.referer);
            if (refererUrl.pathname && !refererUrl.pathname.startsWith('/api/')) {
                returnTo = refererUrl.pathname + refererUrl.search;
            }
        } catch (e) {
            console.error("Invalid referer URL:", req.headers.referer, e);
            returnTo = '/books';
        }
    }
    // Note: req.session.returnTo is handled by the /login and /login-signup routes themselves
    // to persist the intended destination across the login flow, not directly by this utility.

    return returnTo;
}

export function sendHistoryReplacingRedirect(res, targetPath) {
    console.log(`[DEBUG] utils.sendHistoryReplacingRedirect: Attempting to replace history with: ${targetPath}`);
    res.setHeader('Content-Type', 'text/html');


    return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Redirecting...</title>
        </head>
        <body>
            <p>Redirecting now...</p>
            <script>
                console.log("[DEBUG] Client-side script: Executing window.location.replace for: ${targetPath}");
                window.location.replace('${targetPath}'); // Execute immediately
            </script>
        </body>
        </html>
    `);
}