// This file is /utils/utilsjs
import EmailValidation from 'emailvalid';
import * as ol from './ol-handler.js'
import {
    cachedOlids,
    cachedSubjects,
    cachedStatuses,
    cachedLanguages,
    putOlSubject,
    putOlWork,
    putOlEdition,
    putOlWorkSubject,
    putOlAuthor,
    putOlAuthorBook,
    putOlEdition_Language,
    putUserEdition,
    checkUserBook,
    findUser
} from './db-handler.js';

// Helper function to check cachedOlids, cachedSubjects, cachedLanguages
export function checkCache(type, data) {
    switch (type) {
        case 'work_olid':
            return cachedOlids.works.includes(data);
        case 'edition_olid':
            return achedOlids.editions.includes(data);
        case 'author_olid':
            return cachedOlids.authors.includes(olid);
        case 'subject_name':
            return cachedSubjects.some(s => s.name.toLowerCase === data.toLowerCase);
        case 'subject_type':
            return cachedSubjects.some(s => s.type.toLowerCase === data.toLowerCase);
        case 'language_key':
            return cachedLanguages.some((l) => l.key.toLowerCase === data.toLowerCase);
        case 'language':
            return cachedLanguages.some((l) => l.language.toLowerCase === data.toLowerCase);
    }
}

/**
 * Looks up language information from the cachedLanguages array.
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

    // Determine the comparison function based on the 'type'
    const getComparisonFunction = (lookupValue) => {
        switch (type) {
            case 'key':
                return (lang) => lang.key === lookupValue;
            case 'language':
                return (lang) => lang.language === lookupValue;
            case 'id':
                // Use loose equality (==) for ID comparison if data types might vary (string vs. number)
                return (lang) => lang.id == lookupValue;
            default:
                console.warn(`languageLookup: Unsupported lookup type "${type}".`);
                return () => false; // Always returns false for unsupported types
        }
    };

    if (Array.isArray(data)) {
        // If data is an array, map over it to perform lookups for each item
        return data.map(item => {
            const comparisonFn = getComparisonFunction(item);
            const foundLanguage = cachedLanguages.find(comparisonFn);
            return getDesiredValue(foundLanguage);
        });
    } else {
        // If data is a single value, perform a single lookup
        const comparisonFn = getComparisonFunction(data);
        const foundLanguage = cachedLanguages.find(comparisonFn);
        return getDesiredValue(foundLanguage);
    }
}


// Helper function to update cachedOlids and cachedSubjects
export function updateCache(type, olid, data = null) {
    switch (type) {
        case 'edition':
            if (!cachedOlids.editions.includes(olid)) {
                cachedOlids.editions.push(olid);
            }
            break;
        case 'work':
            if (!cachedOlids.works.includes(olid)) {
                cachedOlids.works.push(olid);
            }
            break;
        case 'author':
            if (!cachedOlids.authors.includes(olid)) {
                cachedOlids.authors.push(olid);
            }
            break;
        case 'subject':
            // For subjects, 'data' should be the object {id, name, type}
            if (data && !cachedSubjects.some(s => s.name === data.name)) {
                cachedSubjects.push(data);
            }
            break;
        default:
            console.warn(`Attempted to update cache with unknown type: ${type}`);
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

export async function selectedEdition(user_id, edition_olid) {
    if (!user_id || !edition_olid) {
        throw new Error('User ID and Edition OLID are required.');
    }
    try {
        let isEditionCached = cachedOlids.editions.includes(edition_olid);
        let worksDescription = null;
        let authors = [];

        if (!isEditionCached) {
            console.log(`Processing uncached edition: ${edition_olid}`);

            // 1. Get Edition Details
            const editionResponse = await ol.getData("edition", edition_olid);
            if (!editionResponse || !editionResponse.work_olid) {
                throw new Error(`Failed to retrieve valid edition data for OLID: ${edition_olid}`);
            }
            const work_olid = editionResponse.work_olid;
            let isWorkCached = cachedOlids.works.includes(work_olid);
            let languages = editionResponse.languages; // Capture for later use

            if (!isWorkCached) {
                console.log(`Processing uncached work: ${work_olid}`);
                // 2. Get Work Details
                const worksResponse = await ol.getData("works", work_olid);
                if (!worksResponse || !worksResponse.title) {
                    throw new Error(`Failed to retrieve valid work data for OLID: ${work_olid}`);
                }

                worksDescription = worksResponse.description; // Capture for later use
                authors = worksResponse.authors; // Capture for later use

                // 2a. Store Work Data in DB
                const storedWorkOlid = await putOlWork(
                    work_olid,
                    worksResponse.title,
                    worksResponse.first_publication_date
                );

                if (storedWorkOlid !== work_olid) {
                    throw new Error(`Failed to store work data in database for OLID: ${work_olid}`);
                }
                updateCache('work', work_olid);
                console.log(`... Added works data to database and cache: ${work_olid}`);

                // 2b. Process Subjects
                if (worksResponse.subjects && Array.isArray(worksResponse.subjects) && worksResponse.subjects.length > 0) {
                    console.log(`Processing subjects for work: ${work_olid}`);
                    const subjectPromises = worksResponse.subjects.map(async (subjectName) => {
                        const isSubjectCached = cachedSubjects.some(s => s.name === subjectName);
                        if (!isSubjectCached) {
                            const subject_id = await putOlSubject(subjectName, null); //type is always null for now - will be used to group subjects later
                            if (subject_id) {
                                updateCache('subject', null, {
                                    id: subject_id,
                                    name: subjectName,
                                    type: null
                                });
                                console.log(`... Added subject data to database and cache: ${subjectName}`);
                                return {
                                    id: subject_id,
                                    name: subjectName
                                }; // Return for works_subjects later
                            } else {
                                console.warn(`Failed to store subject '${subjectName}' in database. Skipping association.`);
                                return null; // Indicate failure for this subject
                            }
                        } else {
                            // Find the ID of the cached subject to use for works_subjects
                            const existingSubject = cachedSubjects.find(s => s.name === subjectName);
                            if (existingSubject) {
                                console.log(`... Subject already cached: ${subjectName}`);
                                return {
                                    id: existingSubject.id,
                                    name: subjectName
                                };
                            }
                            return null; // Should not happen if cachedSubjects is correct
                        }
                    });


                    const processedSubjects = (await Promise.all(subjectPromises)).filter(s => s !== null);


                    // 2c. Store Works-Subjects Associations
                    if (processedSubjects.length > 0) {
                        const workSubjectPromises = processedSubjects.map(async (subject) => {
                            try {
                                await putOlWorkSubject(work_olid, subject.id);
                                // console.log(`... Added work-subject association: ${work_olid} - ${subject.name}`);
                            } catch (error) {
                                // Log the error but don't stop the whole process for one failed association
                                console.warn(`Failed to store work-subject association for work ${work_olid} and subject ${subject.name}:`, error.message);
                            }
                        });
                        await Promise.all(workSubjectPromises);
                    }
                } else {
                    console.log(`No subjects found for work: ${work_olid}`);
                }
            } else {
                console.log(`Work already cached: ${work_olid}`);
            }

            // 3. Store Edition Details
            const preferedDescription = editionResponse?.description ?? worksDescription ?? null;
            const storedEditionOlid = await putOlEdition(
                edition_olid,
                work_olid,
                editionResponse.title,
                preferedDescription,
                editionResponse.publish_date,
                editionResponse.cover_url
            );

            if (storedEditionOlid !== edition_olid) {
                throw new Error(`Failed to store edition data in database for OLID: ${edition_olid}`);
            }
            updateCache('edition', edition_olid);
            console.log(`... Added edition data to database and cache: ${edition_olid}`);


            // 4. Store editions_languages Assiciations
            if (languages && Array.isArray(languages) && languages.length > 0) {
                console.log(`Processing languages for edition: ${edition_olid}`);
                for (const language of languages) {

                    if (language && typeof language.key === 'string') {
                        const prefix = 'languages/';
                        const startIndex = language.key.indexOf(prefix);

                        // Substring extraction: Ensure 'languages/' prefix exists
                        let key = language.key; // Default to full key if prefix not found
                        if (startIndex !== -1) {
                            key = language.key.substring(startIndex + prefix.length);
                        } else {
                            console.warn(`Language key "${language.key}" does not contain expected prefix "${prefix}". Using full key.`);
                        }

                        let cachedLanguage_index = cachedLanguages.findIndex((l) => l.key === key);
                        let language_id = cachedLanguages[cachedLanguage_index].id;

                        const storedEdition_Language = await putOlEdition_Language(
                            edition_olid,
                            language_id

                        );

                        if (storedEdition_Language.edition_olid !== edition_olid && storedEdition_Language.language_id !== language_id) {
                            throw new Error(`Failed to store language:edition associacion in database for ${language_id}: ${edition_olid}`);
                        } else {
                            console.log('Successfully set the language for edition_olid: ', edition_olid, "-", cachedLanguages[cachedLanguage_index].language)
                        }
                    } else {
                        console.warn('Skipping malformed language object:', language);
                    }
                };
            } else {
                console.log(`No languages provided for edition: ${edition_olid}`);
            }
        } else {
            console.log(`Edition already cached: ${edition_olid}`);
        }



        // 5. Process Authors (concurrently using Promise.all)
        if (authors && Array.isArray(authors) && authors.length > 0) {
            console.log(`Processing authors for edition: ${edition_olid}`);
            const authorProcessingPromises = authors.map(async (author_olid) => {
                const isAuthorCached = cachedOlids.authors.includes(author_olid);
                if (!isAuthorCached) {
                    console.log(`Processing uncached author: ${author_olid}`);
                    try {
                        const authorResponse = await ol.getData("author", author_olid);
                        if (!authorResponse || !authorResponse.name) {
                            console.warn(`Failed to retrieve valid author data for OLID: ${author_olid}. Skipping.`);
                            return; // Skip this author but don't break the Promise.all
                        }

                        const storedAuthorOlid = await putOlAuthor(
                            author_olid,
                            authorResponse.name,
                            authorResponse.bio,
                            authorResponse.birth_date,
                            authorResponse.death_date,
                            authorResponse.pic_url
                        );

                        if (storedAuthorOlid !== author_olid) {
                            console.warn(`Failed to store author data in database for OLID: ${author_olid}. Skipping association.`);
                            return;
                        }
                        updateCache('author', author_olid);
                        console.log(`... Added author data to database and cache: ${author_olid}`);

                    } catch (error) {
                        console.warn(`Error processing author ${author_olid}:`, error.message);
                        return; // Continue processing other authors
                    }
                } else {
                    console.log(`Author already cached: ${author_olid}`);
                }

                // Always try to associate author with edition if author data is available (cached or newly added)
                try {
                    await putOlAuthorBook(author_olid, edition_olid);
                    // console.log(`... Added author-edition association: ${author_olid} - ${edition_olid}`);
                } catch (error) {
                    // Log the error but don't stop the whole process for one failed association
                    console.warn(`Failed to store author-edition association for author ${author_olid} and edition ${edition_olid}:`, error.message);
                }
            });
            await Promise.all(authorProcessingPromises); // Wait for all authors to be processed
        } else {
            console.log(`No authors provided for edition: ${edition_olid}`);
        }
        logCurrentCache();

        // 5. Add Edition to User's Collection
        const userBookId = await putUserEdition(user_id, edition_olid);
        if (!userBookId) { // Check if putUserEdition returned a valid id or false response
            // This can happen if UNIQUE constraint is violated (user already has this edition)
            // Or if there's a different DB error
            const existingUserBook = await checkUserBook(user_id, edition_olid);
            if (existingUserBook) {
                console.log(`Edition ${edition_olid} already exists in user ${user_id}'s collection.`);
                return `Edition ${edition_olid} is already in your collection.`;
            } else {
                throw new Error(`Failed to add edition ${edition_olid} to user ${user_id}'s collection.`);
            }
        }
        console.log(`Edition ${edition_olid} added to user ${user_id}'s collection.`);
        return `Edition ${edition_olid} added to your collection.`;

    } catch (error) {
        console.error(`Error in selectedEdition for user ${user_id}, edition ${edition_olid}:`, error.message);
        // Re-throw the error so the calling function (e.g., app.post('/edition')) can handle it
        throw error;
    }
}



export function logCurrentCache() {
    console.log('Cached Olids: \n', cachedOlids);
    console.log('Cached Subjects:');
    const transformedCachedSubjects = cachedSubjects.reduce((subjects, {
        id,
        ...x
    }) => {
        subjects[id] = x;
        return subjects
    }, {});
    console.table(transformedCachedSubjects);
    console.log('Cached Statuses:');
    const transformedCachedStatuses = cachedStatuses.reduce((statuses, {
        id,
        ...x
    }) => {
        statuses[id] = x;
        return statuses
    }, {});
    console.table(transformedCachedStatuses);
    console.log('Cached Languages:');
    const transformedCachedLanguages = cachedLanguages.reduce((languages, {
        id,
        ...x
    }) => {
        languages[id] = x;
        return languages
    }, {});
    console.table(transformedCachedLanguages);
}