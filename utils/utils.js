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
            return cachedLanguages.get(lookupValue);
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
 * Helper function to extract the identifier (the part after the prefix)
 * from OpenLibrary API 'key' strings.
 *
 * @param {string} type - The type of key ('languages', 'works', etc.) to determine the prefix.
 * @param {Array<Object>} data - An array of objects, where each object is expected to have a 'key' property (e.g., [{ key: "/languages/eng" }]).
 * @returns {Array<string> | string | null} An array of extracted identifiers for 'languages',
 * a single string for 'works', or null/empty array for invalid input.
 */
export function formatPrefix(type, data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        // If data is empty or invalid, return null for single-item requests (like 'works')
        // and an empty array for multi-item requests (like 'languages').
        return type === 'works' ? null : [];
    }

    let prefix;
    switch (type) {
        case 'languages':
            prefix = '/languages/';
            // For 'languages', we proceed to map the array
            break;

        case 'works':
            prefix = '/works/';
            // For 'works', we expect and process only the first item to return a single OLID
            const workItem = data[0]; // Assuming there's only one work item in the array

            if (!workItem || typeof workItem.key !== 'string') {
                console.warn(`formatPrefix: Invalid item in data array for 'works' type or missing 'key':`, workItem);
                return null;
            }

            if (workItem.key.startsWith(prefix)) {
                return workItem.key.substring(prefix.length);
            } else {
                console.warn(`formatPrefix: Work key "${workItem.key}" does not start with expected prefix "${prefix}". Extracting last segment.`);
                // Fallback to getting the last segment if prefix is not found
                return workItem.key.split('/').pop();
            }

        case 'edition':
            prefix = '/books/';
            // For 'edition', we expect and process only the first item to return a single OLID
            const editionItem = data[0]; // Assuming there's only one work item in the array

            if (!editionItem || typeof editionItem.key !== 'string') {
                console.warn(`formatPrefix: Invalid item in data array for 'edition' type or missing 'key':`, editionItem);
                return null;
            }

            if (editionItem.key.startsWith(prefix)) {
                return editionItem.key.substring(prefix.length);
            } else {
                console.warn(`formatPrefix: Edition key "${editionItem.key}" does not start with expected prefix "${prefix}". Extracting last segment.`);
                // Fallback to getting the last segment if prefix is not found
                return editionItem.key.split('/').pop();
            }
        case 'authors':
            prefix = '/authors/';
            break;
            // Add more cases here for other types if needed (e.g., 'editions')
            // case 'editions':
            //     prefix = '/books/'; // OpenLibrary uses /books/ for editions
            //     break;

        default:
            console.warn(`formatPrefix: Unsupported type "${type}". Returning last segment for all keys.`);
            // Default behavior if 'type' is not recognized: extract last segment for all items
            return data.map(item => item && typeof item.key === 'string' ? item.key.split('/').pop() : null).filter(Boolean);
    }

    // This block is reached only for types that should return an array (e.g., 'languages').
    // The 'works' case will return directly from its own block.
    const transformedKeys = data.map(item => {
        if (!item || typeof item.key !== 'string') {
            console.warn(`formatPrefix: Item in data array is not an object or missing 'key' property:`, item);
            return null; // Return null for invalid individual items
        }

        if (item.key.startsWith(prefix)) {
            return item.key.substring(prefix.length);
        } else {
            console.warn(`formatPrefix: Key "${item.key}" does not start with expected prefix "${prefix}". Extracting last segment.`);
            return item.key.split('/').pop();
        }
    }).filter(Boolean); // Filter out any nulls from invalid items

    return transformedKeys;
}

export async function validateUser(username, password, email, newUser) {
    const errors = [];

    if (!username) {
        errors.push({
            field: 'username',
            message: 'Username cannot be blank.'
        });
    } else {
        const usernameError = await validateUsername(username, newUser);
        if (usernameError instanceof Error) {
            errors.push({
                field: 'username',
                message: usernameError.message
            });
        };
    }

    if (!password) {
        errors.push({
            field: 'password',
            message: 'Password cannot be blank.'
        });
    } else {
        const passwordErrors = await validatePassword(password);
        if (passwordErrors instanceof Error) {
            errors.push({
                field: 'password',
                message: passwordErrors.message
            });
        };
    }

    if (newUser) {
        if (!email) {
            errors.push({
                field: 'email',
                message: 'Email  cannot be blank.'
            });
        } else {
            const emailErrors = await validateEmail(email);
            if (emailErrors instanceof Error) {
                errors.push({
                    field: 'email',
                    message: emailErrors.message
                });
            };
        }
    };

    return errors.length > 0 ? errors : null; // Return the errors array or null if no errors
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

