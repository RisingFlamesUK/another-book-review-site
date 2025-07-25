// This file is /utils/db-handler.js
import {
    database
} from './database.js';
import * as fh from './file-handler.js'
import * as ol from './ol-handler.js'
import * as utils from './utils.js'
export let cachedStatuses = [];
export let cachedSubjects = new Map();
export let cachedLanguages = new Map();
export let languageNameToIdMap = new Map();
export let cachedOlids = {
    editions: new Set(),
    works: new Set(),
    authors: new Set()
};
export let cachedTrending = null;
export let cachedBrowseSubjects = {};

//* --------------------------- *//
//*       User functions        *//
//* --------------------------- *//
// findUser:
// searchBy: "userId" || "username" || "email"
export async function findUser(searchBy, searchItem) {
    // Response:
    //     { 
    //     "userId": userid, 
    //     "username": username, 
    //     "email": email address,
    //     "image": image URL,
    //     "status": status
    //     }
    // OR [] if no user
    // OR
    // Throws an error on failure

    try {
        let dbSearchBy;
        let query;
        let values = [searchItem];

        if (searchBy === "userId") {
            dbSearchBy = "u.id";
        } else if (searchBy === "username") {
            dbSearchBy = "u.username";
        } else if (searchBy === "email") {
            dbSearchBy = "u.email";
        } else {
            const error = new Error(`Invalid searchBy parameter: ${searchBy}`);
            error.statusCode = 400; // Bad Request
            console.error(error.message);
            throw error;
        }

        query = `
            SELECT u.id AS "userId", u.username, u.email, u.image, u.status
            FROM users u
            WHERE ${dbSearchBy} = $1;
        `;

        const result = await database.query(query, values);

        return result.rows[0];

    } catch (error) {
        console.error('Error finding user:', error);
        error.statusCode = error.statusCode || 500; // Preserve existing status or default to 500
        throw error;
    }
};

// addUser:
export async function addUser(username, email, encPassword) {
    // Response:
    //     {
    //     "userId": userId,
    //     "username": username,
    //     "email": email address
    //     }
    // Throws an error on failure during database operations
    email = email.toLowerCase();
    try {
        let newUserResult = await database.query(
            'INSERT INTO users (username, email, enc_password, status) VALUES ($1, $2, $3, $4) RETURNING id AS "userId", username, email;',
            [username, email, encPassword, 'active']
        );

        return {
            userId: newUserResult.rows[0].userId,
            username: newUserResult.rows[0].username,
            email: newUserResult.rows[0].email
        };

    } catch (error) {
        await database.query('ROLLBACK'); // Rollback the transaction on error
        console.error('Error adding user and token:', error);
        error.statusCode = error.statusCode || 500; // Preserve existing status or default to 500
        throw error;
    }
}

// findUserPassword:
export async function findUserPassword(username) {
    // Response:
    //     { 
    //     "userid": [userid], 
    //     "username": [username], 
    //     "encPassword": [encPassword]
    //     "status": [status]
    //     }
    // OR
    // Throws an error on failure
    try {
        const result = await database.query(
            'SELECT id AS "userId", username, enc_password AS "encPassword", status FROM users WHERE username = $1;',
            [username]
        );

        if (result.rows.length === 0) {
            const error = new Error(`User with username "${username}" not found.`);
            error.statusCode = 404; // Not Found
            throw error;
        }

        return result.rows[0];

    } catch (error) {
        error.statusCode = error.statusCode || 500; // Preserve existing status or default to 500
        throw error;
    }
}

//* --------------------------- *//
//*   Book (select) functions   *//
//* --------------------------- *//
/**
 * @typedef {Object} OpenLibraryWorkData
 * @property {Array<Object>} works - An array of work objects, each representing a book.
 * // You might want to define the structure of a single 'work object' more precisely
 * // if you have a consistent schema for them (e.g., title, author, cover_i, etc.).
 */

/**
 * Retrieves the latest cached trending books data from the database.
 * This function queries the `cached_trending_data` table and returns the `data`
 * from the most recently updated entry.
 *
 * @returns {OpenLibraryWorkData|null} The trending books data as a JSON object,
 * or `null` if no trending data is found in the cache.
 * @throws {Error} Throws an error if there's a problem during the database query.
 * @async
 */
export async function getTrendingBooksReelData(period = undefined) {
    // Response:
    //     
    //     JSON: Stored trending books
    //     
    // Throws an error on failure during database operations
    try {
        let whereClause = '';
        if (period) {
            whereClause = 'WHERE period = $1'
        }
        const query = `
            SELECT 
                *
            FROM cached_trending_data
            ${whereClause}
            ORDER BY last_updated DESC;
        `;
        const data = [period];
        const result = await database.query(query, data);

        return result.rows.length > 0 ? result.rows : null;

    } catch (error) {
        console.error(`Error retrieving trending data from database`, error);
        throw new Error(`Database error trending data: ${error.message}`);
    }
}

/**
 * Retrieves the latest cached subject-specific book data from the database.
 * This function queries the `cached_subject_data` table for a given subject and language,
 * returning the `data` from the most recently updated entry.
 *
 * @param {string} subject - The name of the subject to retrieve data for (e.g., 'fiction', 'history').
 * @param {string} [language='eng'] - The language of the books (e.g., 'eng' for English).
 * Defaults to 'eng' if not provided.
 * @returns {OpenLibraryWorkData|null} The subject-specific books data as a JSON object,
 * or `null` if no data is found for the specified subject and language.
 * @throws {Error} Throws an error if there's a problem during the database query.
 * @async
 */
export async function getSubjectsReelData(subject, language) {
    // Response:
    //     
    //     JSON: Stored trending books
    //     
    // Throws an error on failure during database operations
    language = language || "eng";
    try {
        const query = `
            SELECT 
                data, last_updated
            FROM cached_subject_data
            WHERE subject_name = $1 AND language = $2
            ORDER BY last_updated DESC
            LIMIT 1;
        `;
        const data = [subject, language];
        const result = await database.query(query, data);

        return result.rows.length > 0 ? result.rows[0] : null;

    } catch (error) {
        console.error(`Error retrieving subject data from database for subject: ${subject}, language: ${language}`, error);
        throw new Error(`Database error retrieving subject data: ${error.message}`);
    }
}

// getEdition:
export async function getEdition(edition_olid) {
    // Response:
    //     {
    //     "edition_olid": edition_olid,
    //     "work_olid": work_olid,
    //     "title": title,
    //     "publishers": publishers,
    //     "publish_date": publish_date,
    //     "description": description,
    //     "isbn": isbn,
    //     "cover_url": cover_url,
    //     }
    // Throws an error on failure during database operations
    // Returns null when edition is not found
    try {
        const query = `
            SELECT 
                be.edition_olid,
                be.work_olid,
                be.title,
                be.publishers,
                be.publish_date,
                be.description,
                be.isbn,
                be.cover_url
            FROM book_editions AS be
            WHERE be.edition_olid = $1;
        `;
        const data = [edition_olid];
        const result = await database.query(query, data);

        return result.rows[0] || null;

    } catch (error) {
        console.error(`Error getting book: (${edition_olid})s from database:`, error);
        throw new Error(`Database error getting book: (${edition_olid}): ${error.message}`);
    }

}

export async function getWork(work_olid) {
    // Response:
    //     {
    //     "work_olid": work_olid,
    //     "title": title,
    //     "first_publication_date": first_publication_date,
    //     }
    // Throws an error on failure during database operations
    // Returns null when edition is not found
    try {
        const query = `
            SELECT 
                work_olid,
                title,
                first_publication_date
            FROM book_works
            WHERE work_olid = $1;
        `;
        const data = [work_olid];
        const result = await database.query(query, data);

        return result.rows[0] || null;

    } catch (error) {
        console.error(`getWork: Error getting book: (${work_olid})s from database:`, error);
        throw new Error(`Database error getting book: (${work_olid}): ${error.message}`);
    }

}

// getUserBooks:
export async function getUserBooks(user_id, edition_olid = null) {
    // Response:
    //      An array of book objects, each with:
    //     {
    //     "user_id": user_id,
    //     "edition_olid": edition_olid,
    //     "work_olid": work_olid,
    //     "title": title,
    //     "publish_date": publish_date,
    //     "publishers": publishers,
    //     "description": description,
    //     "isbn": isbn,
    //     "cover_url": cover_url,
    //     "status_id": status_id,
    //     "authors": [authors]   //output from getEditionAuthors
    //     "languages": [languages]   //output from getEditionLanguages
    //     "userReview": { userreview: string, userscore: number} //output from getUserReviews
    //     "workScore": { totalScore: number, reviewCount: number , averageScore: number } //output from getWorksScore
    //     }
    // Throws an error on failure during database operations
    // Returns null when editions for that user are not found
    try {
        const [booksResult, userReviewsResult] = await Promise.all([
            database.query(`
                SELECT
                    ub.user_id,
                    ub.edition_olid,
                    be.work_olid,
                    be.title,
                    be.publish_date,
                    be.publishers,
                    be.description,
                    be.isbn,
                    be.cover_url,
                    ub.status_id
                FROM users_books AS ub
                JOIN book_editions AS be ON ub.edition_olid = be.edition_olid
                WHERE ub.user_id = $1
                ${edition_olid ? 'AND ub.edition_olid = $2' : ''}
            `, edition_olid ? [user_id, edition_olid] : [user_id]),
            getUserReviews(user_id)
        ]);

        const booksFromDb = booksResult.rows;
        const userReviews = userReviewsResult || [];

        // If no books are found, return null immediately
        if (booksFromDb.length === 0) {
            return null;
        }

        const reviewsByEditionOlid = userReviews.reduce((acc, review) => {
            acc[review.edition_olid] = review; // Store the full review object here
            return acc;
        }, {});

        // 1. Collect all unique work_olids from the books
        const allWorkOlids = [...new Set(booksFromDb.map(book => book.work_olid))];

        // 2. Fetch all work scores
        const allWorkScores = await getWorksScore(allWorkOlids);

        // 3. Transform the array of work scores into a lookup map for easy access
        const workScoresByWorkOlid = allWorkScores.reduce((acc, score) => {
            // Store the relevant properties in the right format
            acc[score.work_olid] = {
                totalScore: score.totalScore,
                reviewCount: score.reviewCount,
                averageScore: score.averageScore
            };
            return acc;
        }, {});


        // Create an array of promises for fetching authors and languages for each book in parallel
        const bookDetailsPromises = booksFromDb.map(async (book) => {
            const [bookAuthors, bookLanguages] = await Promise.all([
                getEditionAuthors(book.edition_olid),
                getEditionLanguages(book.edition_olid),
            ]);

            // Add review and score from pre-fetched reviews
            const userReviewAndScore = reviewsByEditionOlid[book.edition_olid] || null;

            // Get the work's aggregate score from the pre-fetched map
            // Use || null to ensure it's null if no score found for this work_olid
            const workScoreForBook = workScoresByWorkOlid[book.work_olid] || null;

            return {
                ...book,
                authors: bookAuthors,
                languages: bookLanguages,
                userReview: userReviewAndScore, // Add the user's review and score for this specific book
                workScore: workScoreForBook // Add the work's aggregate score
            };
        });

        // Wait for all book details (authors and languages) to resolve concurrently
        const userBooks = await Promise.all(bookDetailsPromises);

        return userBooks; // Will be an array of books, or null if no books found initially
    } catch (error) {
        console.error(`Error getting user's (${user_id}) books from database:`, error);
        throw new Error(`Database error getting user's (${user_id}) books: ${error.message}`);
    }
}

// getEditionAuthors:
export async function getEditionAuthors(edition_olid) {
    // Response:
    //     {
    //     "edition_olid": edition_olid,
    //     "author_olid": author_olid,
    //     "name": name,
    //     "bio": bio,
    //     "birth_date": birth_date,
    //     "death_date": death_date,
    //     "pic_url": pic_url,
    // Throws an error on failure during database operations
    // Returns null when edition is not found
    try {
        const query = `
            SELECT 
                ab.edition_olid, 
                ab.author_olid, 
                au.name, 
                au.bio, 
                au.birth_date, 
                au.death_date, 
                au.pic_url
            FROM book_editions AS be
            JOIN authors_books AS ab ON ab.edition_olid = be.edition_olid
            JOIN authors AS au ON au.author_olid = ab.author_olid
            WHERE ab.edition_olid = $1;
        `;
        const data = [edition_olid];
        const result = await database.query(query, data);

        return result.rows || null;

    } catch (error) {
        console.error(`Error getting book's (${edition_olid}) authors from database:`, error);
        throw new Error(`Database error getting book's (${edition_olid}) authors: ${error.message}`);
    }
}

export async function getEditionReviews(edition_olid) {
    // Response:
    //     {
    //     "edition_olid": edition_olid,
    //     "user_id,": ub.user_id,
    //     "username": username,
    //     "user_image": image URL,
    //     "user_status": user_status,
    //     "review_id": id
    //     "review_title": review_title,
    //     "review": review,
    //     "score": score,
    //     "created": created,
    //     "last_modified": last_modified
    // Throws an error on failure during database operations
    // Returns null when reviews are not found
    try {
        const query = `
            SELECT 
                ub.edition_olid,
                ub.user_id,
                users.username,
                users.image as user_image,
                users.status as user_status,
                br.id as review_id,
                br.review_title, 
                br.review, 
                br.score,
                br.created,
                br.last_modified
            FROM users_books AS ub
            JOIN book_review AS br ON ub.id = br.user_book_id
            JOIN users ON users.id = ub.user_id
            WHERE ub.edition_olid = $1;
        `;
        const data = [edition_olid];
        const result = await database.query(query, data);

        return result.rows || null;

    } catch (error) {
        console.error(`Error getting book's (${edition_olid}) authors from database:`, error);
        throw new Error(`Database error getting book's (${edition_olid}) authors: ${error.message}`);
    }

}

// getWorkSubjects:
export async function getWorkSubjects(work_olid) {
    // Response:
    //     {
    //     "work_olid": work_olid,
    //     "title": title,
    //     "first_publication_date": first_publication_date,
    //     "subject": [subjects (names)],
    // Throws an error on failure during database operations
    // Returns null when work is not found
    try {
        const query = `
            SELECT 
                bw.work_olid, 
                bw.title, 
                bw.first_publication_date, 
                ws.subject_id
            FROM book_works AS bw
            JOIN works_subjects AS ws ON ws.work_olid = bw.work_olid
            WHERE bw.work_olid = $1;
        `;
        const data = [work_olid];
        const result = await database.query(query, data);

        // Map subject_id to subject name using the cachedSubjects Map
        const workSubjectsWithSubjectNames = result.rows.map(book => {
            let foundSubject = null;
            // Iterate over the values of the cachedSubjects Map to find by ID
            for (const subject of cachedSubjects.values()) {
                if (subject.id === book.subject_id) {
                    foundSubject = subject;
                    break;
                }
            }

            return {
                ...book,
                subject: foundSubject ? foundSubject.name : 'Unknown', // Use foundSubject.name or 'Unknown'
                subject_id: undefined
            };
        });

        return workSubjectsWithSubjectNames.length > 0 ? workSubjectsWithSubjectNames : null;

    } catch (error) {
        console.error(`Error getting book's (${work_olid}) subjects from database:`, error);
        throw new Error(`Database error getting book's (${work_olid}) subjects: ${error.message}`);
    }
}

/**
 * Retrieves languages for one or more edition OLIDs from the database.
 * If a language is not found in the `cachedLanguages` map, it will be returned as `null`.
 *
 * @param {string | string[]} editionOlids - A single edition OLID string or an array of edition OLID strings.
 * @returns {Promise<Array<{ edition_olid: string, languages: string[] }>>} - A promise that resolves to an array of objects.
 * Each object contains `edition_olid` and an array of `languages` (strings) for that edition.
 * Returns an empty array if no editions are found or no languages for the given OLIDs.
 * @throws {Error} Throws an error on failure during database operations or if input is invalid.
 */
export async function getEditionLanguages(editionOlids) {
    try {
        let olidsToQuery = [];
        if (Array.isArray(editionOlids)) {
            olidsToQuery = editionOlids;
        } else if (typeof editionOlids === 'string') {
            olidsToQuery = [editionOlids];
        } else {
            throw new Error('getEditionLanguages: Expected editionOlids to be a string or an array of strings.');
        }

        if (olidsToQuery.length === 0) {
            return [];
        }

        // Generate placeholders for the IN clause (e.g., $1, $2, $3)
        const placeholders = olidsToQuery.map((_, index) => `$${index + 1}`).join(', ');

        const query = `
            SELECT 
                el.edition_olid, 
                el.language_id
            FROM editions_languages AS el
            WHERE el.edition_olid IN (${placeholders});
        `;
        const result = await database.query(query, olidsToQuery);

        const languagesByEdition = new Map();
        olidsToQuery.forEach(olid => languagesByEdition.set(olid, [])); // Initialize with empty arrays

        result.rows.forEach(row => {
            const language = utils.languageLookup('id', row.language_id, 'language');
            if (language) {
                languagesByEdition.get(row.edition_olid).push(language);
            }
        });

        // Convert the map back to the desired array format
        return Array.from(languagesByEdition, ([edition_olid, languages]) => ({
            edition_olid,
            languages
        }));

    } catch (error) {
        console.error(`Error getting languages for (${JSON.stringify(editionOlids)}) from database:`, error);
        throw new Error(`Database error getting languages for (${JSON.stringify(editionOlids)}): ${error.message}`);
    }
}

export async function getUserBookId(user_id, edition_olid = undefined, client = undefined) {
    let localClient = client;
    let shouldRelease = false;

    try {
        if (!localClient) {
            localClient = await database.connect();
            shouldRelease = true;
            await localClient.query('BEGIN');
        }

        const userBookRes = await localClient.query(`
            SELECT id FROM users_books
            WHERE user_id = $1 AND edition_olid = $2;
        `, [user_id, edition_olid]);

        if (userBookRes.rows.length === 0) {
            throw new Error(`Book edition_olid: ${edition_olid} not found in user_id: ${user_id}'s collection`);
        }

        const user_book_id = userBookRes.rows[0].id;

        if (shouldRelease) await localClient.query('COMMIT');
        return user_book_id;

    } catch (error) {
        if (shouldRelease && localClient) await localClient.query('ROLLBACK');
        console.error(`Error in getUserBookId for user ${user_id}, edition ${edition_olid}:`, error);
        throw new Error(`Database error getting user book ID: ${error.message}`);
    } finally {
        if (shouldRelease && localClient) localClient.release();
    }
}


// getUserReviews:
export async function getUserReviews(user_id, edition_olid = undefined) {
    // edition_olid is optional
    // Returns array of each edition's reviews in this format:
    //     {
    //     "edition_olid": edition_olid,
    //     "review_id": review_id,
    //     "userreviewtitle": review_title,
    //     "userreview": review,
    //     "userscore": score,
    //     "userreviewcreated": created,
    //     "userreviewmodified": last_modified
    //      }
    // Throws an error on failure during database operations
    // Returns null when the user review is not found
    let edition_text = ''
    // if (edition_olid) {
    //     edition_text = ' AND ub.edition_olid = $2'
    //     edition_data = ', ' + edition_olid
    // }
    try {
        let query = `
            SELECT
            ub.edition_olid,
            br.id as review_id,
            br.review_title as userreviewtitle,
            br.review as userreview,
            br.score as userscore,
            br.created as userreviewcreated,
            br.last_modified as userreviewmodified
        FROM users_books AS ub
        JOIN book_review AS br ON ub.id = br.user_book_id
        WHERE ub.user_id = $1
        `;
        const data = [user_id];
        if (edition_olid) {
            query += ' AND ub.edition_olid = $2';
            data.push(edition_olid);
        }

        query += ';';

        const result = await database.query(query, data);

        return result.rows || null;

    } catch (error) {
        console.error(`Error getting user (${user_id})'s reviews from database:`, error);
        throw new Error(`Database error getting user (${user_id})'s reviews: ${error.message}`);
    }
}

/**
 * Retrieves the work score and review count for a given Open Library Work ID (work_olid) or an array of Work IDs from the database.
 *
 * @param {string | string[]} work_olid_or_olids - The Open Library ID of the work (e.g., "OL12345W") or an array of IDs (e.g., ["OL12345W", "OL67890W"]).
 * @param {object} [client=database] - Optional. The database client to use for the query. Defaults to the global `database` object.
 * @returns {Promise<Object[]>} A promise that resolves to an array of objects, each containing the work score and review count for the found works.
 * If no work scores are found for the provided IDs, an empty array is returned.
 * The returned object in the array has the following structure:
 * - `work_olid`: {string} The Open Library ID of the work.
 * - `totalScore`: {number} The calculated total score for the work.
 * - `reviewCount`: {number} The total number of reviews for the work.
 * - `averageScore`: {number} The calculated average score for the work.
 * @throws {Error} If a failure occurs during the database operation.
 */
export async function getWorksScore(work_olid_or_olids, client = database) {
    try {
        const workOlids = typeof work_olid_or_olids === 'string' ? [work_olid_or_olids] :
            Array.isArray(work_olid_or_olids) ?
            work_olid_or_olids : [];

        if (workOlids.length === 0) {
            return Array.isArray(work_olid_or_olids) ? [] : null;
        }

        const result = await client.query(`
      SELECT work_olid, score AS totalscore, review_count AS reviewcount
      FROM works_scores
      WHERE work_olid = ANY($1)
    `, [workOlids]);

        function wrapRow(r) {
            const avg = r.reviewcount > 0 ? r.totalscore / r.reviewcount : 0;
            return {
                work_olid: r.work_olid,
                totalScore: r.totalscore,
                reviewCount: r.reviewcount,
                averageScore: avg
            };
        }

        if (typeof work_olid_or_olids === 'string') {
            if (result.rows.length === 0) return null;
            return wrapRow(result.rows[0]);
        } else {
            return result.rows.map(wrapRow);
        }

    } catch (err) {
        console.error(`DB error getting works_score for ${work_olid_or_olids}:`, err);
        throw err;
    }
}

/**
 * @typedef {Object} AuthorDetail
 * @property {string} author_olid - The Open Library ID of the author (e.g., "OL12345A").
 * @property {string} name - The author's full name.
 * @property {string | null} bio - A short biography of the author, or null if not available.
 * @property {string | null} birth_date - The author's birth date (e.g., "January 1, 1900"), or null.
 * @property {string | null} death_date - The author's death date (e.g., "December 31, 2000"), or null.
 * @property {string | null} pic_url - The URL to the author's cached profile picture, or null.
 */

/**
 * Retrieves details for one or more authors from the local database.
 * The function normalizes the input, validates each Open Library ID (OLID)
 * to ensure it's a valid author OLID, and then queries the database.
 *
 * @param {string | string[]} authorOlidInput - A single author OLID string (e.g., "OL123A")
 * or an array of author OLID strings (e.g., ["OL123A", "OL456B"]).
 * @returns {Promise<AuthorDetail[]>} A promise that resolves to an array of AuthorDetail objects.
 * Returns an empty array if:
 * - The input is invalid (e.g., not a string or array of strings).
 * - No valid author OLIDs are provided after validation.
 * - No authors matching the valid OLIDs are found in the database.
 * @throws {Error} Throws an error if a database operation fails.
 */
export async function getAuthors(authorOlidInput) {

    let olidList = [];

    // --- 1. Normalize Input: Ensure authorOlidInput is an array ---
    if (typeof authorOlidInput === 'string') {
        olidList = [authorOlidInput];
    } else if (Array.isArray(authorOlidInput)) {
        olidList = authorOlidInput;
    } else {
        console.warn("getAuthors: Invalid input type. Expected string or array of strings for author OLIDs.");
        return []; // Return empty array for invalid input type
    }

    // If, after normalization, the list is empty, return early
    if (olidList.length === 0) {
        return [];
    }

    const validAuthorOlids = [];

    // --- 2. Validate Each OLID using validateOlid function ---
    for (const olid of olidList) {
        try {
            const olidType = utils.validateOlid(olid); // validateOlid throws on invalid format
            if (olidType === 'author') {
                validAuthorOlids.push(olid);
            } else {
                console.warn(`getAuthors: OLID '${olid}' is a valid Open Library ID, but not an author type ('${olidType}'). Skipping.`);
            }
        } catch (validationError) {
            console.warn(`getAuthors: Invalid author OLID format for '${olid}': ${validationError.message}. Skipping.`);
        }
    }

    // If no valid author OLIDs remain after validation, return early
    if (validAuthorOlids.length === 0) {
        return [];
    }

    try {
        // Generate a comma-separated string of placeholders ($1, $2, ...)
        const placeholders = validAuthorOlids.map((_, index) => `$${index + 1}`).join(', ');

        const query = `
            SELECT 
                author_olid, 
                name,
                bio,
                birth_date,
                death_date,
                pic_url
            FROM authors
            WHERE author_olid IN (${placeholders});
        `;

        const result = await database.query(query, validAuthorOlids);

        if (result.rows.length === 0) {
            return [];
        }

        return result.rows;

    } catch (error) {
        console.error(`Error getting authors for OLIDs [${validAuthorOlids.join(', ')}] from database:`, error);
        throw new Error(`Database error getting authors for OLIDs [${validAuthorOlids.join(', ')}]: ${error.message}`);
    }
}


//* --------------------------- *//
//* User Book (edit/add/delete) *//
//*    functions                *//
//* --------------------------- *//
/**
 * Sets or updates a user's score for a specific book edition and updates the overall work score.
 *
 * @param {number} user_id - The ID of the user.
 * @param {string} edition_olid - The Open Library Edition ID of the book.
 * @param {string} work_olid - The Open Library Work ID of the book.
 * @param {number} score - The score given by the user (e.g., 1-5).
 * @returns {Promise<Object>} A promise that resolves to an object containing the new user score, new work score, and new work review count.
 * @throws {Error} If a failure occurs during any database operation or if the user-book relationship is not found.
 */
export async function putUserScore(user_id, edition_olid, work_olid, score) {
    let client;
    try {
        client = await database.connect();
        await client.query('BEGIN'); // Start transaction

        // 1. Determine existing user-book review
        const oldResult = await client.query(`
            SELECT
                br.id AS review_id, 
                br.score
            FROM users_books AS ub
            JOIN book_review AS br ON ub.id = br.user_book_id
            WHERE ub.user_id = $1 AND ub.edition_olid = $2;
        `, [user_id, edition_olid]);

        const isNewReview = oldResult.rows.length === 0;
        const oldScore = isNewReview ? 0 : oldResult.rows[0].score;
        const newScore = score;
        const scoreChange = newScore - oldScore;

        // 2. INSERT or UPDATE book_review
        let reviewResult;
        if (isNewReview) {
            const userBookRes = await client.query(`
        SELECT id FROM users_books
        WHERE user_id = $1 AND edition_olid = $2
      `, [user_id, edition_olid]);
            if (!userBookRes.rows.length) {
                throw new Error(`User-book not found`);
            }
            const user_book_id = userBookRes.rows[0].id;

            reviewResult = await client.query(`
        INSERT INTO book_review (user_book_id, score, last_modified)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        RETURNING *
      `, [user_book_id, newScore]);
        } else {
            const review_id = oldResult.rows[0].review_id;
            reviewResult = await client.query(`
        UPDATE book_review SET score = $1, last_modified = CURRENT_TIMESTAMP
        WHERE id = $2 RETURNING *
      `, [newScore, review_id]);
        }

        if (!reviewResult.rows.length) {
            throw new Error('Failed to insert/update review');
        }

        // 3. Update aggregate work score
        const {
            newWorkScore,
            newReviewCount
        } = await updateWorkScore({
            client,
            work_olid,
            scoreChange,
            isNewReview
        });

        await client.query('COMMIT');

        return {
            newUserScore: reviewResult.rows[0].score,
            newWorkScore,
            newReviewCount
        };

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error(`Error in putUserScore:`, err);
        throw new Error(`Database error setting user score: ${err.message}`);
    } finally {
        if (client) client.release();
    }
}

/**
 * Inserts or updates a book review using ON CONFLICT on user_book_id.
 *
 * @param {UUID} user_id
 * @param {string} edition_olid
 * @param {string} review_title
 * @param {string} review
 * @param {number} score
 * @returns {Promise<Object>} The inserted or updated review row.
 */
export async function putUserReview(user_id, edition_olid, review_title, review, score) {
    let client;
    try {
        client = await database.connect();
        await client.query('BEGIN');

        const user_book_id = await getUserBookId(user_id, edition_olid, client);

        // 1. Fetch oldScore for calculating scoreChange
        const oldRow = await client.query(`
            SELECT score FROM book_review
            WHERE user_book_id = $1
            `, [user_book_id]);

        const oldScore = oldRow.rows.length > 0 ? oldRow.rows[0].score : null;

        // 2. Upsert the review
        const reviewResult = await client.query(`
            INSERT INTO book_review (user_book_id, review_title, review, score)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_book_id) WHERE user_book_id IS NOT NULL
            DO UPDATE SET
                review_title = EXCLUDED.review_title,
                review = EXCLUDED.review,
                score = EXCLUDED.score,
                last_modified = CURRENT_TIMESTAMP
            RETURNING *;
            `, [user_book_id, review_title, review, score]);

        // 3. Retrieve work_olid for aggregation
        const ub = await client.query(`
            SELECT be.work_olid
            FROM book_editions AS be
            JOIN users_books AS ub ON ub.edition_olid = be.edition_olid
            WHERE ub.id = $1
            `, [user_book_id]);

        if (!ub.rows.length || !ub.rows[0].work_olid) {
            throw new Error(`Missing work_olid for user_book_id: ${user_book_id}`);
        }
        const work_olid = ub.rows[0].work_olid;

        // 4. Compute scoreChange and identify new vs update
        const newScore = score;
        const scoreChange = newScore - (oldScore || 0);
        const isNewReview = oldScore === null;

        // 5. Update aggregated work score
        const {
            newWorkScore,
            newReviewCount
        } = await updateWorkScore({
            client,
            work_olid,
            scoreChange,
            isNewReview
        });

        await client.query('COMMIT');

        return {
            review: reviewResult.rows[0],
            workScore: newWorkScore,
            reviewCount: newReviewCount
        };

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        throw err;
    } finally {
        if (client) client.release();
    }
}

export async function patchUserReview(user_id, edition_olid, updates = {}) {
    let client;
    try {
        client = await database.connect();
        await client.query('BEGIN');

        const user_book_id = await getUserBookId(user_id, edition_olid, client);

        // 1. Fetch old score for calculating scoreChange
        const oldRow = await client.query(`
      SELECT score FROM book_review
      WHERE user_book_id = $1
    `, [user_book_id]);

        const oldScore = oldRow.rows.length > 0 ? oldRow.rows[0].score : null;

        // 2. Build dynamic upsert values
        const review_title = updates.review_title ?? null;
        const review = updates.review ?? null;
        const score = updates.score ?? null;

        const reviewResult = await client.query(`
      INSERT INTO book_review (user_book_id, review_title, review, score)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_book_id) WHERE user_book_id IS NOT NULL
      DO UPDATE SET
        review_title = COALESCE(EXCLUDED.review_title, book_review.review_title),
        review = COALESCE(EXCLUDED.review, book_review.review),
        score = COALESCE(EXCLUDED.score, book_review.score),
        last_modified = CURRENT_TIMESTAMP
      RETURNING *;
    `, [user_book_id, review_title, review, score]);

        // 3. Get work_olid for aggregation
        const ub = await client.query(`
      SELECT be.work_olid
      FROM book_editions AS be
      JOIN users_books AS ub ON ub.edition_olid = be.edition_olid
      WHERE ub.id = $1
    `, [user_book_id]);

        if (!ub.rows.length || !ub.rows[0].work_olid) {
            throw new Error(`Missing work_olid for user_book_id: ${user_book_id}`);
        }

        const work_olid = ub.rows[0].work_olid;

        // 4. Compute score change
        const newScore = reviewResult.rows[0].score;
        const scoreChange = (newScore ?? 0) - (oldScore ?? 0);
        const isNewReview = oldScore === null;

        // 5. Update work score
        const {
            newWorkScore,
            newReviewCount
        } = await updateWorkScore({
            client,
            work_olid,
            scoreChange,
            isNewReview
        });

        await client.query('COMMIT');

        return {
            review: reviewResult.rows[0],
            workScore: newWorkScore,
            reviewCount: newReviewCount
        };
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        throw err;
    } finally {
        if (client) client.release();
    }
}

/**
 * Update a user's status for a specific edition.
 * @param {string} userId
 * @param {string} editionOlid
 * @param {number} statusId
 * @returns {Promise<boolean>} true if success
 */
export async function putUserEditionStatus(userId, editionOlid, statusId) {
    const query = `
    UPDATE users_books
    SET status_id = $3,
        last_modified = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND edition_olid = $2;
  `;

    try {
        const result = await database.query(query, [userId, editionOlid, statusId]);
        return result.rowCount > 0; // true if update happened, false if not found
    } catch (err) {
        console.error('Error in putUserEditionStatus:', err);
        return false;
    }
}

/**
 * Adds a new edition to a user's collection in the database.
 * If the user already has the edition, it will not be re-added, and the function will return null.
 *
 * @async
 * @param {string} user_id - The unique identifier of the user.
 * @param {string} edition_olid - The Open Library ID (OLID) of the edition to add.
 * @param {number} [status_id=1] - The initial status ID for the book (default is 1).
 * @returns {Promise<number | null>} A promise that resolves to the ID of the newly inserted user-edition record if successful,
 * or `null` if the edition already exists in the user's collection (due to a unique constraint).
 * @throws {Error} Throws an error if a database operation fails for reasons other than a unique constraint violation.
 */
export async function postUserEdition(user_id, edition_olid, status_id = 1) {
    try {
        let query = `
     INSERT INTO users_books (user_id, edition_olid, status_id)
     VALUES ($1, $2, $3)
     RETURNING id;             
    `
        let data = [user_id, edition_olid, status_id]

        const result = await database.query(query, data);

        return result.rows[0]?.id || null; // Return the id if available otherwise null indicates failure

    } catch (error) {
        // If it's a unique constraint violation (user already has this book)
        if (error.code === '23505') {
            console.warn(`User ${user_id} already has edition ${edition_olid} in their collection.`);
            return null; // Returning null to indicate it wasn't a *new* insertion
        }
        console.error(`Error writing user:edition ${user_id}:${edition_olid} to database:`, error);
        throw new Error(`Database error adding user edition ${user_id}:${edition_olid}: ${error.message}`);
    }
}

export async function deleteUserEdition(user_id, edition_olid) {
    const client = await database.connect();
    try {
        await client.query('BEGIN');

        // Get review to retrieve score and edition -> work relationship
        const userReviews = await getUserReviews(user_id, edition_olid);
        const userScore = userReviews?.[0]?.userscore ?? null;

        const workResult = await client.query(`
            SELECT work_olid FROM book_editions WHERE edition_olid = $1
        `, [edition_olid]);

        const work_olid = workResult.rows?.[0]?.work_olid;
        if (!work_olid) throw new Error('Work OLID not found for edition.');

        // Delete from users_books (cascades to review and notes)
        const result = await client.query(`
            DELETE FROM users_books
            WHERE user_id = $1 AND edition_olid = $2
        `, [user_id, edition_olid]);

        const deletedCount = result.rowCount;
        let workscore
        // If user had a review, refresh the score
        if (userScore !== null) {
            workscore = await refreshWorkScore(client, work_olid);
        }

        await client.query('COMMIT');
        return {deletedCount, workscore};

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error deleting user edition (${user_id}, ${edition_olid}):`, error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Checks if a specific edition already exists in a user's book collection in the database.
 *
 * @async
 * @param {string} user_id - The unique identifier of the user.
 * @param {string} edition_olid - The Open Library ID (OLID) of the edition to check.
 * @returns {Promise<Object | null>} A promise that resolves to the database record object for the user-edition
 * (e.g., `{ id: number }`) if found, or `null` if the edition is not in the user's collection.
 * @throws {Error} Throws an error if a database operation fails.
 */
export async function checkUserBook(user_id, edition_olid) {
    try {
        const query = `
            SELECT id FROM users_books
            WHERE user_id = $1 AND edition_olid = $2;
        `;
        const data = [user_id, edition_olid];
        const result = await database.query(query, data);

        return result.rows[0] || null; // Returns the row if found, otherwise null inicates that the book isnt in the user's collection

    } catch (error) {
        console.error(`Error checking user book existence for user ${user_id}, edition ${edition_olid}:`, error);
        throw new Error(`Database error checking user book: ${error.message}`);
    }
}




/**
 * Update or create the aggregated work score for a given work OLID.
 * You must pass either:
 *   - `client`, `work_olid`, and `scoreChange` (+/- from previous review)
 *   OR
 *   - just `work_olid` and `score` (+1…5) for new review (without client).
 *
 * @param {Object} params
 * @param {import('pg').PoolClient} [params.client] - Optional DB client/transaction.
 * @param {string} params.work_olid - The work OLID.
 * @param {number} params.scoreChange - Difference between new and old score, or the full score if new.
 * @param {boolean} params.isNewReview - True if this is a newly added review (not update).
 * @returns {Promise<{ newWorkScore: number, newReviewCount: number }>}
 */
async function updateWorkScore({
    client,
    work_olid,
    scoreChange,
    isNewReview
}) {
    let ownDb = false;
    if (!client) {
        client = await database.connect();
        await client.query('BEGIN');
        ownDb = true;
    }

    const res = await client.query(`
        SELECT score AS workscore, review_count FROM works_scores WHERE work_olid = $1
        `, [work_olid]);

    let newScore, newCount;

    if (res.rows.length > 0) {
        const {
            workscore: cur,
            review_count: cnt
        } = res.rows[0];
        newScore = cur + scoreChange;
        newCount = cnt + (isNewReview ? 1 : 0);
        await client.query(`
            UPDATE works_scores
                SET score = $1, review_count = $2
                WHERE work_olid = $3
            `, [newScore, newCount, work_olid]);
    } else {
        newScore = scoreChange;
        newCount = 1;
        await client.query(`
            INSERT INTO works_scores (work_olid, score, review_count)
            VALUES ($1, $2, $3)
            `, [work_olid, newScore, newCount]);
    }

    if (ownDb) {
        await client.query('COMMIT');
    }

    if (ownDb) client.release();

    return {
        newWorkScore: newScore,
        newReviewCount: newCount
    };
}

export async function refreshWorkScore(client, work_olid) {
    let ownDb = false;
    try {
        if (!client) {
            client = await database.connect();
            await client.query('BEGIN');
            ownDb = true;
        }

        const res = await client.query(`
            SELECT br.score
            FROM book_editions AS be
            JOIN users_books AS ub ON ub.edition_olid = be.edition_olid
            JOIN book_review AS br ON ub.id = br.user_book_id
            WHERE be.work_olid = $1
        `, [work_olid]);

        const reviewCount = res.rowCount;
        const totalScore = res.rows.reduce((sum, row) => sum + (row.score || 0), 0);

        await client.query(`
        INSERT INTO works_scores (work_olid, score, review_count, last_checked)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (work_olid)
            DO UPDATE SET
                score = EXCLUDED.score,
                review_count = EXCLUDED.review_count,
                last_checked = CURRENT_TIMESTAMP
        `, [work_olid, totalScore, reviewCount]);

        if (ownDb) {
            await client.query('COMMIT');
        }

        if (ownDb) client.release();

        return {
            workScore: totalScore,
            reviewCount
        };

    } catch (err) {
        if (ownDb) await client.query('ROLLBACK');
        throw err;
    } finally {
        if (ownDb) client.release();
    }
}

//* --------------------------- *//
//*   Book (post) functions     *//
//*   (Data from Open Library)  *//
//* --------------------------- *//


/**
 * Inserts a new Open Library work into the database.
 * This function includes validation for its input parameters using `validateOlid` for `work_olid`.
 * If the work (identified by `work_olid`) already exists, this function will typically
 * cause a unique constraint violation if `work_olid` is a primary key or has a unique constraint.
 * In a more robust system, consider using `ON CONFLICT` clause in the SQL query for updates or silent skips.
 *
 * @param {string} work_olid - The Open Library ID of the work (e.g., "OL123W"). Must be a valid OLID of type 'work'.
 * @param {string} title - The title of the work. Must be a non-empty string.
 * @param {string | null} first_publication_date - The first publication date of the work (can be null or a non-empty string).
 * @returns {Promise<string | null>} A promise that resolves to the `work_olid` of the newly inserted work
 * or `null` if the insertion fails (e.g., due to an empty result set from the DB).
 * @throws {Error} Throws an error if input validation fails or if the database operation fails.
 */
export async function postOlWork(work_olid, title, first_publication_date) {
    // Input validation
    try {
        const type = utils.validateOlid(work_olid);
        if (type !== 'work') {
            throw new Error(`Invalid OLID type for work_olid: Expected 'work', got '${type}'.`);
        }
    } catch (error) {
        throw new Error(`postOlWork: Invalid work_olid format. ${error.message}`);
    }

    if (typeof title !== 'string' || title.trim() === '') {
        throw new Error('postOlWork: Invalid title. Must be a non-empty string.');
    }
    if (first_publication_date !== null && typeof first_publication_date !== 'string') {
        throw new Error('postOlWork: Invalid first_publication_date. Must be a string or null.');
    }

    try {
        let query = `
            INSERT INTO book_works (work_olid, title, first_publication_date)
            VALUES ($1, $2, $3)
            RETURNING work_olid;
        `;
        let data = [work_olid, title, first_publication_date];

        const result = await database.query(query, data);

        if (result.rows[0]?.work_olid) {
            updateCache("works", result.rows[0].work_olid);
        }

        console.log(`... Added works data to database and cache: ${work_olid}`);
        return result.rows[0]?.work_olid || null; // Return the work_olid if available otherwise null indicates failure

    } catch (error) {
        console.error(`Error writing work ${work_olid} to database:`, error);
        throw new Error(`Database error storing work ${work_olid}: ${error.message}`);
    }
}

/**
 * @typedef {Object} OlAuthor - Represents the structure of an Open Library author object for database insertion.
 * @property {string} author_olid - The Open Library ID for the author (e.g., "OL123A"). Must be a valid OLID format.
 * @property {string} name - The primary name of the author.
 * @property {string | null} [bio] - The author's biography (optional, defaults to null if not provided).
 * @property {string | null} [birth_date] - The author's birth date (optional, defaults to null if not provided).
 * @property {string | null} [death_date] - The author's death date (optional, defaults to null if not provided).
 * @property {string | null} [pic_url] - URL to the author's picture (optional, defaults to null if not provided).
 */

/**
 * Inserts one or more Open Library author objects into the database in a batch,
 * and updates the in-memory cache for successfully added authors.
 * This function handles input validation and leverages `ON CONFLICT DO NOTHING`
 * to efficiently skip authors that already exist in the database without causing errors.
 *
 * @param {OlAuthor[]} authors - An array of author objects to be inserted into the database.
 * Each object must contain at least `author_olid` and `name`. Optional fields
 * (bio, birth_date, death_date, pic_url) should be strings or null.
 * @returns {Promise<string[]>} - A promise that resolves to an array of `author_olid`s
 * for the authors that were successfully *newly inserted* into the database.
 * @throws {Error} - Throws an error if the input `authors` is not a valid array,
 * or if a database operation fails unexpectedly. Invalid individual author objects
 * within the array will be skipped with a warning, but won't stop the batch.
 */
export async function postOlAuthors(authors) {
    // --- Input Validation for the 'authors' array itself ---
    if (!Array.isArray(authors) || authors.length === 0) {
        throw new Error('postOlAuthors: Expected an array of author objects, but received an empty or invalid array.');
    }

    const queryValuePlaceholders = []; // e.g., '($1, $2, $3, $4, $5, $6)' for each author
    const flattenedQueryValues = []; // Flat array of all values for the prepared statement
    const processedAuthors = []; // Authors that passed initial validation and will be attempted for insertion

    for (const author of authors) {
        // --- Data Type Defense for each individual author object ---
        if (typeof author !== 'object' || author === null) {
            console.warn('postOlAuthors: Skipping invalid author entry (not an object).', author);
            continue;
        }

        const {
            author_olid,
            name,
            bio,
            birth_date,
            death_date,
            pic_url
        } = author;

        // Ensure required fields are present and of correct type
        if (typeof name !== 'string' || name.trim() === '') {
            console.warn('postOlAuthors: Skipping author due to missing or invalid required name.', author);
            continue;
        }

        try {
            // Validate the author_olid format using the external validateOlid function
            const type = utils.validateOlid(author_olid);
            if (type !== 'author') {
                throw new Error(`Invalid OLID type for author_olid: Expected 'author', got '${type}'.`);
            }
        } catch (error) {
            console.warn(`postOlAuthors: Skipping author '${author_olid}' due to invalid OLID format. ${error.message}`);
            continue;
        }

        // Add placeholders for the current author's values in the SQL query
        // E.g., if flattenedQueryValues.length is 0, this becomes ($1, $2, $3, $4, $5, $6)
        // If flattenedQueryValues.length is 6, this becomes ($7, $8, ...)
        queryValuePlaceholders.push(`($${flattenedQueryValues.length + 1}, $${flattenedQueryValues.length + 2}, $${flattenedQueryValues.length + 3}, $${flattenedQueryValues.length + 4}, $${flattenedQueryValues.length + 5}, $${flattenedQueryValues.length + 6})`);

        // Add the actual values to the flattened array, ensuring optional fields are `null` if undefined
        flattenedQueryValues.push(
            author_olid,
            name,
            bio || null, // Ensure bio is null if not provided
            birth_date || null, // Ensure birth_date is null if not provided
            death_date || null, // Ensure death_date is null if not provided
            pic_url || null // Ensure pic_url is null if not provided
        );

        // Keep track of authors that passed validation and are included in this batch
        processedAuthors.push(author_olid);
    }

    if (queryValuePlaceholders.length === 0) {
        console.log("postOlAuthors: No valid authors found to insert after filtering input array.");
        return []; // No valid authors to insert, return empty array
    }

    // Construct the full SQL INSERT query for batch insertion
    // ON CONFLICT (author_olid) DO NOTHING: This is crucial for efficiency.
    // If an author with the same author_olid already exists, the database will
    // simply skip inserting that row without throwing an error, and it won't be
    // included in the RETURNING clause.
    let query = `
        INSERT INTO authors (author_olid, name, bio, birth_date, death_date, pic_url)
        VALUES ${queryValuePlaceholders.join(', ')}
        ON CONFLICT (author_olid) DO NOTHING
        RETURNING author_olid;
    `;

    try {
        const result = await database.query(query, flattenedQueryValues);

        const successfullyInsertedOlids = [];
        if (result.rows && result.rows.length > 0) {
            for (const row of result.rows) {
                const olAuthorId = row.author_olid;
                successfullyInsertedOlids.push(olAuthorId);
                // Update in-memory cache for each author that was *newly inserted* by the DB
                updateCache("authors", olAuthorId);
            }
        }

        console.log(`postOlAuthors: Processed ${processedAuthors.length} authors. Successfully inserted/updated ${successfullyInsertedOlids.length} new authors in database and cache.`);

        return successfullyInsertedOlids; // Return OLIDs of newly inserted authors

    } catch (error) {
        console.error(`Error during batch insertion of authors:`, error);
        throw new Error(`Database error storing authors: ${error.message}`);
    }
}

/**
 * Inserts a new Open Library edition into the database.
 * This function includes validation for its input parameters using `validateOlid` for `edition_olid` and `work_olid`.
 * If the edition (identified by `edition_olid`) already exists, this function will typically
 * cause a unique constraint violation if `edition_olid` is a primary key or has a unique constraint.
 * Consider adding `ON CONFLICT` to the SQL query for more graceful handling of duplicates.
 *
 * @param {string} edition_olid - The Open Library ID of the edition (e.g., "OL123E"). Must be a valid OLID of type 'edition'.
 * @param {string} work_olid - The Open Library ID of the work associated with this edition. Must be a valid OLID of type 'work'.
 * @param {string} title - The title of the edition. Must be a non-empty string.
 * @param {string | null} [description=null] - A description of the edition (optional, defaults to null, can be a non-empty string).
 * @param {array of strings | null} publishers - The publishers of the edition (can be null or a non-empty string).
 * @param {string | null} publish_date - The publication date of the edition (can be null or a non-empty string).
 * @param {string | null} isbn - The isbn of the edition (can be null or a non-empty string).
 * @param {string | null} [cover_url] - URL to the edition's cover image (can be null or a non-empty string).
 * @returns {Promise<string | null>} A promise that resolves to the `edition_olid` of the newly inserted edition
 * or `null` if the insertion fails.
 * @throws {Error} Throws an error if input validation fails or if the database operation fails.
 */
export async function postOlEdition(edition_olid, work_olid, title, description = null, publishers, publish_date, isbn, cover_url) {
    cover_url = (cover_url === undefined ? null : cover_url);
    publishers = (publishers === undefined ? null : publishers);
    if (Array.isArray(publishers)) {
        publishers = JSON.stringify(publishers);
    }
    // Input validation

    try {
        const type = utils.validateOlid(edition_olid);
        if (type !== 'edition') {
            throw new Error(`   - postOlEdition: Invalid OLID type for edition_olid: Expected 'edition', got '${type}'.`);
        }
    } catch (error) {
        throw new Error(`   - postOlEdition: Invalid edition_olid format: ${edition_olid}. ${error.message}`);
    }

    try {
        const type = utils.validateOlid(work_olid);
        if (type !== 'work') {
            throw new Error(`   - postOlEdition: Invalid OLID type for work_olid: Expected 'work', got '${type}'.`);
        }
    } catch (error) {
        throw new Error(`   - postOlEdition: Invalid work_olid format. ${error.message}`);
    }

    if (typeof title !== 'string' || title.trim() === '') {
        throw new Error('   - postOlEdition: Invalid title. Must be a non-empty string.');
    }
    if (description !== null && typeof description !== 'string') {
        throw new Error('   - postOlEdition: Invalid description. Must be a string or null.');
    }
    if (publishers !== null && typeof publishers !== 'string') {
        throw new Error('   - postOlEdition: Invalid publishers. Must be a string (or array that converts to string) or null.');
    }
    if (publish_date !== null && typeof publish_date !== 'string') {
        throw new Error('   - postOlEdition: Invalid publish_date. Must be a string or null.');
    }
    if (isbn !== null && typeof isbn !== 'string') {
        throw new Error('   - postOlEdition: Invalid isbn. Must be a string or null.');
    }
    if (cover_url !== null && typeof cover_url !== 'string') {
        throw new Error('   - postOlEdition: Invalid cover_url. Must be a string or null.');
    }


    try {
        let query = `
            INSERT INTO book_editions (edition_olid, work_olid, title, description, publishers, publish_date, isbn, cover_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING edition_olid;
        `;
        let data = [edition_olid, work_olid, title, description, publishers, publish_date, isbn, cover_url];

        const result = await database.query(query, data);
        if (result.rows[0]?.edition_olid) {
            updateCache("editions", result.rows[0].edition_olid);
        }

        console.log(`   ... postOlEdition: Added edition data to database and cache: ${edition_olid}`);

        return result.rows[0]?.edition_olid || null; // Return the edition_olid if available otherwise null indicates failure

    } catch (error) {
        console.error(`   - postOlEdition: Error writing edition ${edition_olid} to database:`, error);
        throw new Error(`   - postOlEdition: Database error storing edition ${edition_olid}: ${error.message}`);
    }
}

/**
 * @typedef {Object} OlSubject
 * @property {string} name - The name of the subject.
 * @property {string | null} [type] - The type of the subject (optional).
 */

/**
 * Inserts one or more Open Library subject objects into the database in a batch.
 * If a subject with the same name and type combination already exists, it will be skipped (`ON CONFLICT (name, type) DO NOTHING`).
 * Updates the in-memory cache for successfully newly inserted subjects.
 *
 * @param {OlSubject[]} subjects - An array of subject objects to be inserted.
 * Each object must contain at least a `name` property. The `type` property is optional.
 * @returns {Promise<Object[]>} - A promise that resolves to an array of objects for the
 * successfully *newly inserted* subjects (each object includes id, name, type).
 * Returns an empty array if no valid subjects are provided or inserted.
 * @throws {Error} - Throws an error if the input is not a valid array of subjects or
 * if a critical database operation fails.
 */
export async function postOlSubjects(subjects) {
    // Input validation: ensure 'subjects' is a non-empty array
    if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
        throw new Error('   - postOlSubjects: Expected an array of subject objects, but received an empty or invalid array.');
    }

    const queryValuePlaceholders = []; // Array to hold '($1, $2)', '($3, $4)', etc., for each subject
    const flattenedQueryValues = []; // Flat array of all values for the prepared statement

    for (const subject of subjects) {
        // Data defense for each individual subject object
        if (typeof subject !== 'object' || subject === null) {
            console.warn('   - postOlSubjects: Skipping invalid subject entry (not an object).', subject);
            continue;
        }

        const {
            name,
            type
        } = subject;

        // Validate required field: 'name'
        if (typeof name !== 'string' || name.trim() === '') {
            console.warn('   - postOlSubjects: Skipping subject due to missing or invalid name.', subject);
            continue;
        }

        // Add placeholders for the current subject's values to construct the SQL query dynamically
        queryValuePlaceholders.push(`($${flattenedQueryValues.length + 1}, $${flattenedQueryValues.length + 2})`);

        // Add the actual values to the flattened array, ensuring optional 'type' is null if not provided
        flattenedQueryValues.push(
            name,
            type || null // Set to null if type is undefined, null, or an empty string
        );
    }

    // If no valid subjects were found after filtering, return early
    if (queryValuePlaceholders.length === 0) {
        console.log("   postOlSubjects: No valid subjects to insert after filtering.");
        return [];
    }

    let query = `
        INSERT INTO subjects (name, type)
        VALUES ${queryValuePlaceholders.join(', ')}
        ON CONFLICT (name, type) DO NOTHING
        RETURNING *;
    `;

    try {
        const result = await database.query(query, flattenedQueryValues);

        const newlyInsertedSubjects = [];
        if (result.rows && result.rows.length > 0) {
            for (const row of result.rows) {
                newlyInsertedSubjects.push(row);
                // Update the in-memory cache for each *newly inserted* subject
                // Assuming updateCache function takes (type, key, dataObject)
                updateCache("subject", null, row); // 'null' is used for the key
            }
        }
        console.log(`   ... postOlSubjects: Attempted to process ${subjects.length} subjects. Successfully inserted ${newlyInsertedSubjects.length} new subjects.`);

        // Return the full objects of newly inserted subjects, including their generated IDs
        return newlyInsertedSubjects;

    } catch (error) {
        // Log the original error for debugging purposes
        console.error(`   - postOlSubjects: Error during batch insertion of subjects:`, error);
        // Re-throw a more general error message to avoid exposing internal database details
        throw new Error(`   - postOlSubjects: Database error storing subjects: ${error.message}`);
    }
}


/**
 * @typedef {Object} WorksSubjectsAssociation
 * @property {string} work_olid - The Open Library ID of the work (e.g., "OL123W").
 * @property {number} subject_id - The internal database ID of the subject.
 */
/**
 * Creates multiple associations between works and subjects in the database in a batch.
 * This function includes validation for its input parameters.
 * It handles cases where associations already exist by using `ON CONFLICT DO NOTHING`,
 * allowing existing associations to be skipped without errors.
 *
 * @param {WorkSubjectAssociation[]} associations - An array of objects, where each object
 * represents a work-subject association to be created.
 * @returns {Promise<WorkSubjectAssociation[]>} A promise that resolves to an array of full row objects for the *newly created* associations.
 * Returns an empty array if no valid associations are provided or inserted.
 * @throws {Error} Throws an error if the input `associations` is not a valid array,
 * or if a critical database operation fails unexpectedly. Invalid individual
 * associations within the array will be skipped with a warning.
 */
export async function postOlWorksSubjects(associations) {
    // --- Input Validation for the 'associations' array itself ---
    if (!Array.isArray(associations) || associations.length === 0) {
        throw new Error('postOlWorksSubjects: Expected an array of association objects, but received an empty or invalid array.');
    }

    const queryValuePlaceholders = [];
    const flattenedQueryValues = [];

    for (const assoc of associations) {
        // --- Data Type Defense for each individual association object ---
        if (typeof assoc !== 'object' || assoc === null) {
            console.warn('postOlWorksSubjects: Skipping invalid association entry (not an object).', assoc);
            continue;
        }

        const {
            work_olid,
            subject_id
        } = assoc;

        // Input validation for individual work_olid
        try {
            const type = utils.validateOlid(work_olid);
            if (type !== 'work') {
                throw new Error(`Invalid OLID type for work_olid: Expected 'work', got '${type}'.`);
            }
        } catch (error) {
            console.warn(`postOlWorksSubjects: Skipping association due to invalid work_olid '${work_olid}': ${error.message}`);
            continue;
        }

        // Input validation for individual subject_id
        if (typeof subject_id !== 'number' || !Number.isInteger(subject_id)) {
            console.warn(`postOlWorksSubjects: Skipping association due to invalid subject_id '${subject_id}'. Must be an integer.`);
            continue;
        }

        // Add placeholders for the current association's values
        queryValuePlaceholders.push(`($${flattenedQueryValues.length + 1}, $${flattenedQueryValues.length + 2})`);

        // Add the actual values to the flattened array
        flattenedQueryValues.push(work_olid, subject_id);
    }

    if (queryValuePlaceholders.length === 0) {
        console.log("postOlWorksSubjects: No valid associations found to insert after filtering input array.");
        return []; // No valid associations to insert, return empty array
    }

    let query = `
        INSERT INTO works_subjects (work_olid, subject_id)
        VALUES ${queryValuePlaceholders.join(', ')}
        ON CONFLICT (work_olid, subject_id) DO NOTHING
        RETURNING *;
    `;

    try {
        const result = await database.query(query, flattenedQueryValues);

        const newAssociations = result.rows;

        console.log(`postOlWorksSubjects: Processed ${associations.length} potential associations. Successfully inserted ${newAssociations.length} new associations.`);
        return newAssociations;

    } catch (error) {
        console.error(`Error during batch insertion of work-subject associations:`, error);
        throw new Error(`Database error storing work-subject associations: ${error.message}`);
    }
}

/**
 * @typedef {Object} AuthorBookAssociation
 * @property {string} author_olid - The Open Library ID of the author.
 * @property {string} edition_olid - The Open Library ID of the edition (book).
 */

/**
 * Creates multiple associations between authors and editions (books) in the database in a batch.
 * This function includes validation for its input parameters.
 * It handles cases where associations already exist by using `ON CONFLICT DO NOTHING`,
 * allowing existing associations to be skipped without errors.
 *
 * @param {AuthorBookAssociation[]} associations - An array of objects, where each object
 * represents an author-edition association to be created.
 * @returns {Promise<AuthorBookAssociation[]>} A promise that resolves to an array of full row objects for the *newly created* associations.
 * Returns an empty array if no valid associations are provided or inserted.
 * @throws {Error} Throws an error if the input `associations` is not a valid array,
 * or if a critical database operation fails unexpectedly. Invalid individual
 * associations within the array will be skipped with a warning.
 */
export async function postOlAuthorsBooks(associations) {
    // --- Input Validation for the 'associations' array itself ---
    if (!Array.isArray(associations) || associations.length === 0) {
        throw new Error('   - postOlAuthorsBooks: Expected an array of association objects, but received an empty or invalid array.');
    }

    const queryValuePlaceholders = [];
    const flattenedQueryValues = [];

    for (const assoc of associations) {
        // --- Data Type Defense for each individual association object ---
        if (typeof assoc !== 'object' || assoc === null) {
            console.warn('   - postOlAuthors: Books: Skipping invalid association entry (not an object).', assoc);
            continue;
        }

        const {
            author_olid,
            edition_olid
        } = assoc;

        // Input validation for individual author_olid
        try {
            const type = utils.validateOlid(author_olid);
            if (type !== 'author') {
                throw new Error(`   - postOlAuthors: Invalid OLID type for author_olid: Expected 'author', got '${type}'.`);
            }
        } catch (error) {
            console.warn(`   - postOlAuthors: Books: Skipping association due to invalid author_olid '${author_olid}': ${error.message}`);
            continue;
        }

        // Input validation for individual edition_olid
        try {
            const type = utils.validateOlid(edition_olid);
            if (type !== 'edition') {
                throw new Error(`   - postOlAuthors: Invalid OLID type for edition_olid: Expected 'edition', got '${type}'.`);
            }
        } catch (error) {
            console.warn(`   - postOlAuthors: Books: Skipping association due to invalid edition_olid '${edition_olid}': ${error.message}`);
            continue;
        }

        queryValuePlaceholders.push(`($${flattenedQueryValues.length + 1}, $${flattenedQueryValues.length + 2})`);
        flattenedQueryValues.push(author_olid, edition_olid);
    }

    if (queryValuePlaceholders.length === 0) {
        console.warn("   - postOlAuthors: Books: No valid associations found to insert after filtering input array.");
        return [];
    }

    let query = `
        INSERT INTO authors_books (author_olid, edition_olid)
        VALUES ${queryValuePlaceholders.join(', ')}
        ON CONFLICT (author_olid, edition_olid) DO NOTHING -- Assuming this is your unique constraint
        RETURNING *;
    `;

    try {
        const result = await database.query(query, flattenedQueryValues);

        const newAssociations = result.rows;

        console.log(`   ... postOlAuthorsBooks: Processed ${associations.length} potential associations. Successfully inserted ${newAssociations.length} new associations.`);
        return newAssociations;

    } catch (error) {
        console.error(`   - postOlAuthors: Error during batch insertion of author-edition associations:`, error);
        throw new Error(`   - postOlAuthors: Database error storing author-edition associations: ${error.message}`);
    }
}

/**
 * @typedef {Object} OlLanguage - Represents the structure of a language object for database insertion.
 * @property {string} language - The full name of the language (e.g., "English").
 * @property {string} key - The Open Library key for the language (e.g., "/languages/eng").
 * @property {number} [id] - The internal database ID for the language (assigned after insertion).
 */

/**
 * Inserts one or more Open Library language objects into the database in a batch.
 * If a language with the same 'key' already exists, it will be skipped (`ON CONFLICT (key) DO NOTHING`).
 * Updates the in-memory cache for successfully newly inserted languages.
 *
 * @param {OlLanguage[]} languages - An array of language objects to be inserted.
 * Each object must contain `language` and `key` properties.
 * @returns {Promise<OlLanguage[]>} - A promise that resolves to an array of the
 * successfully *newly inserted* language objects (including their `id`).
 * Returns an empty array if no valid languages are provided or inserted.
 * @throws {Error} - Throws an error if the input `languages` is not a valid array,
 * or if a critical database operation fails unexpectedly. Invalid individual
 * language objects within the array will be skipped with a warning.
 */
export async function postOlLanguages(languages) {
    // --- Input Validation for the 'languages' array itself ---
    if (!Array.isArray(languages) || languages.length === 0) {
        throw new Error('postOlLanguages: Expected an array of language objects, but received an empty or invalid array.');
    }

    const queryValuePlaceholders = [];
    const flattenedQueryValues = [];

    for (const lang of languages) {
        // --- Data Type Defense for each individual language object ---
        if (typeof lang !== 'object' || lang === null) {
            console.warn('postOlLanguages: Skipping invalid language entry (not an object).', lang);
            continue;
        }

        const {
            language,
            key
        } = lang;

        // Validate required fields: 'language' and 'key'
        if (typeof language !== 'string' || language.trim() === '') {
            console.warn('postOlLanguages: Skipping language due to missing or invalid "language" property.', lang);
            continue;
        }
        if (typeof key !== 'string' || key.trim() === '') {
            console.warn('postOlLanguages: Skipping language due to missing or invalid "key" property.', lang);
            continue;
        }

        queryValuePlaceholders.push(`($${flattenedQueryValues.length + 1}, $${flattenedQueryValues.length + 2})`);
        flattenedQueryValues.push(language, key);
    }

    if (queryValuePlaceholders.length === 0) {
        console.log("postOlLanguages: No valid languages found to insert after filtering input array.");
        return []; // No valid languages to insert, return empty array
    }

    let query = `
        INSERT INTO languages (language, key)
        VALUES ${queryValuePlaceholders.join(', ')}
        ON CONFLICT (key) DO NOTHING
        RETURNING *; -- Return all columns for caching and caller validation
    `;

    try {
        const result = await database.query(query, flattenedQueryValues);

        const newLanguages = result.rows;

        // Update in-memory cache for each language that was *newly inserted* by the DB
        if (newLanguages.length > 0) {
            for (const langRow of newLanguages) {
                const languageToCache = {
                    ...langRow,
                    id: parseInt(langRow.id)
                };
                updateCache("language", null, languageToCache);
            }
        }

        console.log(`postOlLanguages: Processed ${languages.length} languages. Successfully inserted ${newLanguages.length} new languages in database and cache.`);
        return newLanguages;

    } catch (error) {
        console.error(`Error during batch insertion of languages:`, error);
        throw new Error(`Database error storing languages: ${error.message}`);
    }
}

/**
 * @typedef {Object} EditionLanguageAssociation
 * @property {string} edition_olid - The Open Library ID of the edition (e.g., "OL123E").
 * @property {number} language_id - The internal database ID of the language.
 */

/**
 * Creates multiple associations between editions and languages in the database in a batch.
 * This function includes validation for its input parameters.
 * It handles cases where associations already exist by using `ON CONFLICT DO NOTHING`,
 * allowing existing associations to be skipped without errors.
 *
 * @param {EditionLanguageAssociation[]} associations - An array of objects, where each object
 * represents an edition-language association to be created.
 * @returns {Promise<EditionLanguageAssociation[]>} A promise that resolves to an array of full row objects for the *newly created* associations.
 * Returns an empty array if no valid associations are provided or inserted.
 * @throws {Error} Throws an error if the input `associations` is not a valid array,
 * or if a critical database operation fails unexpectedly. Invalid individual
 * associations within the array will be skipped with a warning.
 */
export async function postOlEditionsLanguages(associations) {
    // --- Input Validation for the 'associations' array itself ---
    if (!Array.isArray(associations) || associations.length === 0) {
        throw new Error('postOlEditionsLanguages: Expected an array of association objects, but received an empty or invalid array.');
    }

    const queryValuePlaceholders = [];
    const flattenedQueryValues = [];

    for (const assoc of associations) {
        // --- Data Type Defense for each individual association object ---
        if (typeof assoc !== 'object' || assoc === null) {
            console.warn('postOlEditionsLanguages: Skipping invalid association entry (not an object).', assoc);
            continue;
        }

        const {
            edition_olid,
            language_id
        } = assoc;

        // Input validation for individual edition_olid
        try {
            const type = utils.validateOlid(edition_olid);
            if (type !== 'edition') {
                throw new Error(`Invalid OLID type for edition_olid: Expected 'edition', got '${type}'.`);
            }
        } catch (error) {
            console.warn(`postOlEditionsLanguages: Skipping association due to invalid edition_olid '${edition_olid}': ${error.message}`);
            continue;
        }

        // Input validation for individual language_id
        if (typeof language_id !== 'number' || !Number.isInteger(language_id)) {
            console.warn(`postOlEditionsLanguages: Skipping association due to invalid language_id '${language_id}'. Must be an integer.`);
            continue;
        }

        queryValuePlaceholders.push(`($${flattenedQueryValues.length + 1}, $${flattenedQueryValues.length + 2})`);
        flattenedQueryValues.push(edition_olid, language_id);
    }

    if (queryValuePlaceholders.length === 0) {
        console.log("postOlEditionsLanguages: No valid associations found to insert after filtering input array.");
        return [];
    }

    let query = `
        INSERT INTO editions_languages (edition_olid, language_id)
        VALUES ${queryValuePlaceholders.join(', ')}
        ON CONFLICT (edition_olid, language_id) DO NOTHING
        RETURNING *;
    `;

    try {
        const result = await database.query(query, flattenedQueryValues);

        const newAssociations = result.rows;

        console.log(`postOlEditionsLanguages: Processed ${associations.length} potential associations. Successfully inserted ${newAssociations.length} new associations.`);
        return newAssociations;

    } catch (error) {
        console.error(`Error during batch insertion of edition-language associations:`, error);
        throw new Error(`Database error storing edition-language associations: ${error.message}`);
    }
}

//* ---------------------------- *//
//* Book (PUT /Update) functions *//
//*   (Data from Open Library)   *//
//* ---------------------------- *//

/**
 * Overwrites an Open Library work in the database.
 * This function includes validation for its input parameters using `validateOlid` for `work_olid`.
 *
 * @param {string} work_olid - The Open Library ID of the work (e.g., "OL123W"). Must be a valid OLID of type 'work'.
 * @param {string} title - The title of the work. Must be a non-empty string.
 * @param {string | null} first_publication_date - The first publication date of the work (can be null or a non-empty string).
 * @returns {Promise<string | null>} A promise that resolves to the `work_olid` of the newly inserted work
 * or `null` if the insertion fails (e.g., due to an empty result set from the DB).
 * @throws {Error} Throws an error if input validation fails or if the database operation fails.
 */
export async function putOlWork(work_olid, title, first_publication_date) {
    // Input validation
    try {
        const type = utils.validateOlid(work_olid);
        if (type !== 'work') {
            throw new Error(`Invalid OLID type for work_olid: Expected 'work', got '${type}'.`);
        }
    } catch (error) {
        throw new Error(`putOlWork: Invalid work_olid format. ${error.message}`);
    }

    if (typeof title !== 'string' || title.trim() === '') {
        throw new Error('putOlWork: Invalid title. Must be a non-empty string.');
    }
    if (first_publication_date !== null && typeof first_publication_date !== 'string') {
        throw new Error('putOlWork: Invalid first_publication_date. Must be a string or null.');
    }

    try {

        let query = `
            INSERT INTO book_works (work_olid, title, first_publication_date)
            VALUES ($1, $2, $3)
            ON CONFLICT (work_olid) DO UPDATE SET
                title = EXCLUDED.title,
                first_publication_date = EXCLUDED.first_publication_date,
                last_refreshed = CURRENT_TIMESTAMP
            RETURNING work_olid;
        `;
        let data = [work_olid, title, first_publication_date];


        const result = await database.query(query, data);

        if (result.rows[0]?.work_olid) {
            updateCache("works", result.rows[0].work_olid);
        }

        console.log(`   ... Updated works data to database and cache: ${work_olid}`);
        return result.rows[0]?.work_olid || null; // Return the work_olid if available otherwise null indicates failure

    } catch (error) {
        console.error(`Error writing updated work ${work_olid} to database:`, error);
        throw new Error(`Database error updating work ${work_olid}: ${error.message}`);
    }
}

/**
 * @typedef {Object} OlAuthor - Represents the structure of an Open Library author object for database insertion/update.
 * @property {string} author_olid - The Open Library ID for the author (e.g., "OL123A"). Must be a valid OLID format and of type 'author'.
 * @property {string} name - The primary name of the author. Must be a non-empty string.
 * @property {string | null} [bio] - The author's biography (optional, defaults to null if not provided or empty).
 * @property {string | null} [birth_date] - The author's birth date (optional, defaults to null if not provided or empty).
 * @property {string | null} [death_date] - The author's death date (optional, defaults to null if not provided or empty).
 * @property {string | null} [pic_url] - URL to the author's picture (optional, defaults to null if not provided or empty).
 */

/**
 * Inserts or updates one or more Open Library author records in the database in a batch.
 * This function utilizes a `MERGE` (UPSERT) operation:
 * - If an author (identified by `author_olid`) already exists, its `name`, `bio`, `birth_date`, `death_date`, and `pic_url` will be updated.
 * - If an author does not exist, a new record will be inserted.
 *
 * Input authors are validated before processing. Invalid author objects will be skipped with a warning.
 * Successfully processed authors (both newly inserted and updated) will have their `author_olid` returned
 * and their presence in the in-memory cache updated.
 *
 * @param {OlAuthor[]} authors - An array of author objects to be inserted or updated in the database.
 * Each object must conform to the `OlAuthor` typedef.
 * @returns {Promise<string[]>} A promise that resolves to an array of `author_olid`s that were
 * successfully processed (either inserted or updated) by the database operation.
 * Returns an empty array if no valid authors are provided or processed.
 * @throws {Error} Throws an error if the input `authors` is not a valid array, or if a critical
 * database operation fails unexpectedly. Individual invalid author objects within the array
 * will be skipped with warnings but will not halt the entire batch operation.
 */
export async function putOlAuthors(authors) {
    // --- Input Validation for the 'authors' array itself ---
    if (!Array.isArray(authors) || authors.length === 0) {
        throw new Error('putOlAuthors: Expected an array of author objects, but received an empty or invalid array.');
    }

    const queryValuePlaceholders = []; // e.g., '($1, $2, $3, $4, $5, $6)' for each author
    const flattenedQueryValues = []; // Flat array of all values for the prepared statement
    const processedAuthors = []; // Authors that passed initial validation and will be attempted for insertion

    for (const author of authors) {
        // --- Data Type Defense for each individual author object ---
        if (typeof author !== 'object' || author === null) {
            console.warn('putOlAuthors: Skipping invalid author entry (not an object).', author);
            continue;
        }

        const {
            author_olid,
            name,
            bio,
            birth_date,
            death_date,
            pic_url
        } = author;

        // Ensure required fields are present and of correct type
        if (typeof name !== 'string' || name.trim() === '') {
            console.warn('putOlAuthors: Skipping author due to missing or invalid required name.', author);
            continue;
        }

        try {
            // Validate the author_olid format using the external validateOlid function
            const type = utils.validateOlid(author_olid);
            if (type !== 'author') {
                throw new Error(`putOlAuthors: Invalid OLID type for author_olid: Expected 'author', got '${type}'.`);
            }
        } catch (error) {
            console.warn(`putOlAuthors: Skipping author '${author_olid}' due to invalid OLID format. ${error.message}`);
            continue;
        }

        // Add placeholders for the current author's values in the SQL query
        // E.g., if flattenedQueryValues.length is 0, this becomes ($1, $2, $3, $4, $5, $6)
        // If flattenedQueryValues.length is 6, this becomes ($7, $8, ...)
        queryValuePlaceholders.push(`($${flattenedQueryValues.length + 1}, $${flattenedQueryValues.length + 2}, $${flattenedQueryValues.length + 3}, $${flattenedQueryValues.length + 4}, $${flattenedQueryValues.length + 5}, $${flattenedQueryValues.length + 6})`);

        // Add the actual values to the flattened array, ensuring optional fields are `null` if undefined
        flattenedQueryValues.push(
            author_olid,
            name,
            bio || null, // Ensure bio is null if not provided
            birth_date || null, // Ensure birth_date is null if not provided
            death_date || null, // Ensure death_date is null if not provided
            pic_url || null // Ensure pic_url is null if not provided
        );

        // Keep track of authors that passed validation and are included in this batch
        processedAuthors.push(author_olid);
    }

    if (queryValuePlaceholders.length === 0) {
        console.log("putOlAuthors: No valid authors found to insert after filtering input array.");
        return []; // No valid authors to insert, return empty array
    }

    let query = `
        INSERT INTO authors (author_olid, name, bio, birth_date, death_date, pic_url)
        VALUES ${queryValuePlaceholders.join(', ')}
        ON CONFLICT (author_olid) DO UPDATE SET
            name = EXCLUDED.name,
            bio = EXCLUDED.bio,
            birth_date = EXCLUDED.birth_date,
            death_date = EXCLUDED.death_date,
            pic_url = EXCLUDED.pic_url,
            last_refreshed = CURRENT_TIMESTAMP
        RETURNING author_olid;
    `;
    try {
        const result = await database.query(query, flattenedQueryValues);

        const successfullyInsertedOlids = [];

        if (result.rows && result.rows.length > 0) {
            for (const row of result.rows) {
                const olAuthorId = row.author_olid;
                successfullyInsertedOlids.push(olAuthorId);
                // Update in-memory cache for each author that was *newly inserted* by the DB
                updateCache("authors", olAuthorId);
            }
        }

        console.log(`putOlAuthors: Processed ${processedAuthors.length} authors. Successfully updated ${successfullyInsertedOlids.length} authors in database and cache.`);

        return successfullyInsertedOlids; // Return OLIDs of newly inserted authors

    } catch (error) {
        console.error(`Error during batch update of authors:`, error);
        throw new Error(`Database error storing authors: ${error.message}`);
    }
}

/**
 * Updates an existing edition in the database wit Open Library data.
 * This function includes validation for its input parameters using `validateOlid` for `edition_olid` and `work_olid`.
 *
 * @param {string} edition_olid - The Open Library ID of the edition (e.g., "OL123E"). Must be a valid OLID of type 'edition'.
 * @param {string} work_olid - The Open Library ID of the work associated with this edition. Must be a valid OLID of type 'work'.
 * @param {string} title - The title of the edition. Must be a non-empty string.
 * @param {string | null} [description=null] - A description of the edition (optional, defaults to null, can be a non-empty string).
 * @param {array of strings | null} publishers - The publishers of the edition (can be null or a non-empty string).
 * @param {string | null} publish_date - The publication date of the edition (can be null or a non-empty string).
 * @param {string | null} [cover_url] - URL to the edition's cover image (can be null or a non-empty string).
 * @param {string | null} isbn - The isbn of the edition (can be null or a non-empty string).
 * @returns {Promise<string | null>} A promise that resolves to the `edition_olid` of the newly inserted edition
 * or `null` if the insertion fails.
 * @throws {Error} Throws an error if input validation fails or if the database operation fails.
 */
export async function putOlEdition(edition_olid, work_olid, title, description = null, publishers, publish_date, isbn, cover_url) {
    cover_url = (cover_url === undefined ? null : cover_url);
    publishers = (publishers === undefined ? null : publishers);

    if (Array.isArray(publishers)) {
        publishers = JSON.stringify(publishers);
    }

    // Input validation
    try {
        const type = utils.validateOlid(edition_olid);
        if (type !== 'edition') {
            throw new Error(`Invalid OLID type for edition_olid: Expected 'edition', got '${type}'.`);
        }
    } catch (error) {
        throw new Error(`putOlEdition: Invalid edition_olid format. ${error.message}`);
    }

    try {
        const type = utils.validateOlid(work_olid);
        if (type !== 'work') {
            throw new Error(`putOlEdition: Invalid OLID type for work_olid: Expected 'work', got '${type}'.`);
        }
    } catch (error) {
        throw new Error(`putOlEdition: Invalid work_olid format. ${error.message}`);
    }

    if (typeof title !== 'string' || title.trim() === '') {
        throw new Error('putOlEdition: Invalid title. Must be a non-empty string.');
    }
    if (description !== null && typeof description !== 'string') {
        throw new Error('putOlEdition: Invalid description. Must be a string or null.');
    }
    if (publishers !== null && typeof publishers !== 'string') {
        throw new Error('putOlEdition: Invalid publishers. Must be a string (or array that converts to string) or null.');
    }
    if (publish_date !== null && typeof publish_date !== 'string') {
        throw new Error('putOlEdition: Invalid publish_date. Must be a string or null.');
    }
    if (isbn !== null && typeof isbn !== 'string') {
        throw new Error('putOlEdition: Invalid isbn. Must be a string or null.');
    }
    if (cover_url !== null && typeof cover_url !== 'string') {
        throw new Error('putOlEdition: Invalid cover_url. Must be a string or null.');
    }


    try {

        let query = `
            INSERT INTO book_editions (edition_olid, work_olid, title, description, publishers, publish_date, isbn, cover_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (edition_olid) DO UPDATE SET
                work_olid = EXCLUDED.work_olid,
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                publishers = EXCLUDED.publishers,
                publish_date = EXCLUDED.publish_date,
                isbn = EXCLUDED.isbn,
                cover_url = EXCLUDED.cover_url,
                last_refreshed = CURRENT_TIMESTAMP
            RETURNING edition_olid;
        `;

        let data = [edition_olid, work_olid, title, description, publishers, publish_date, isbn, cover_url];

        const result = await database.query(query, data);
        if (result.rows[0]?.edition_olid) {
            updateCache("editions", result.rows[0].edition_olid);
        }

        console.log(`... Updataed edition data to database and cache: ${edition_olid}`);

        return result.rows[0]?.edition_olid || null; // Return the edition_olid if available otherwise null indicates failure

    } catch (error) {
        console.error(`Error updating edition ${edition_olid} in database:`, error);
        throw new Error(`Database error updating edition ${edition_olid}: ${error.message}`);
    }
}

/**
 * @typedef {Object} WorksSubjectsAssociation
 * @property {string} work_olid - The Open Library ID of the work (e.g., "OL123W").
 * @property {number} subject_id - The internal database ID of the subject.
 */
/**
 * Updates multiple associations between works and subjects in the database.
 * This function effectively synchronizes the associations: it deletes all existing
 * associations for the provided work_olids and then inserts the new ones.
 *
 * @param {WorksSubjectsAssociation[]} associations - An array of objects, where each object
 * represents a work-subject association to be created.
 * @returns {Promise<WorksSubjectsAssociation[]>} A promise that resolves to an array of full row objects for the *newly created* associations.
 * Returns an empty array if no valid associations are provided or inserted.
 * @throws {Error} Throws an error if the input `associations` is not a valid array,
 * or if a critical database operation fails unexpectedly. Invalid individual
 * associations within the array will be skipped with a warning.
 */
export async function putOlWorksSubjects(associations) {
    // --- Input Validation for the 'associations' array itself ---
    if (!Array.isArray(associations) || associations.length === 0) {
        throw new Error('   - putOlWorksSubjects: Expected an array of association objects, but received an empty or invalid array.');
    }

    const validAssociations = [];
    const uniqueWorkOlids = new Set(); // To track which works need their old subjects deleted

    for (const assoc of associations) {
        // --- Data Type Defense for each individual association object ---
        if (typeof assoc !== 'object' || assoc === null) {
            console.warn('   - putOlWorksSubjects: Skipping invalid association entry (not an object).', assoc);
            continue;
        }

        const {
            work_olid,
            subject_id
        } = assoc;

        // Input validation for individual work_olid
        try {
            const type = utils.validateOlid(work_olid);
            if (type !== 'work') {
                throw new Error(`   - putOlWorksSubjects: Invalid OLID type for work_olid: Expected 'work', got '${type}'.`);
            }
        } catch (error) {
            console.warn(`   - putOlWorksSubjects: Skipping association due to invalid work_olid '${work_olid}': ${error.message}`);
            continue;
        }

        // Input validation for individual subject_id
        if (typeof subject_id !== 'number' || !Number.isInteger(subject_id)) {
            console.warn(`   - putOlWorksSubjects: Skipping association due to invalid subject_id '${subject_id}'. Must be an integer.`);
            continue;
        }

        validAssociations.push(assoc);
        uniqueWorkOlids.add(work_olid); // Collect unique work OLIDs
    }

    if (validAssociations.length === 0) {
        console.log("   putOlWorksSubjects: No valid associations found after filtering input array.");
        return []; // No valid associations to insert, return empty array
    }

    try {
        // Step 1: Delete all existing associations for the affected works
        if (uniqueWorkOlids.size > 0) {
            const deleteQuery = `
                DELETE FROM works_subjects
                WHERE work_olid = ANY($1::text[]);
            `;
            // Convert Set to array for PostgreSQL ANY operator
            await database.query(deleteQuery, [Array.from(uniqueWorkOlids)]);
            console.log(`   putOlWorksSubjects: Deleted existing associations for ${uniqueWorkOlids.size} unique works.`);
        }

        // Step 2: Insert all new associations (batch insert with ON CONFLICT DO NOTHING)
        const queryValuePlaceholders = [];
        const flattenedQueryValues = [];
        validAssociations.forEach((assoc, index) => {
            const startIdx = index * 2;
            queryValuePlaceholders.push(`($${startIdx + 1}, $${startIdx + 2})`);
            flattenedQueryValues.push(assoc.work_olid, assoc.subject_id);
        });

        const insertQuery = `
            INSERT INTO works_subjects (work_olid, subject_id)
            VALUES ${queryValuePlaceholders.join(', ')}
            ON CONFLICT (work_olid, subject_id) DO NOTHING
            RETURNING *;
        `;

        const result = await database.query(insertQuery, flattenedQueryValues);

        const newAssociations = result.rows;

        console.log(`   putOlWorksSubjects: Processed ${validAssociations.length} valid associations. Successfully inserted ${newAssociations.length} new associations.`);
        return newAssociations;

    } catch (error) {
        console.error(`   - putOlWorksSubjects: Error during synchronization of work-subject associations:`, error);
        throw new Error(`   - putOlWorksSubjects: Database error synchronizing work-subject associations: ${error.message}`);
    }
}

/**
 * @typedef {Object} AuthorBookAssociation
 * @property {string} author_olid - The Open Library ID of the author.
 * @property {string} edition_olid - The Open Library ID of the edition (book).
 */

/**
 * Synchronizes multiple associations between authors and editions (books) in the database.
 * This function effectively replaces the existing associations for the provided authors:
 * it deletes all current associations for those authors and then inserts the new ones.
 *
 * @param {AuthorBookAssociation[]} associations - An array of objects, where each object
 * represents an author-edition association to be created.
 * @returns {Promise<AuthorBookAssociation[]>} A promise that resolves to an array of full row objects for the *newly created* associations.
 * Returns an empty array if no valid associations are provided or inserted.
 * @throws {Error} Throws an error if the input `associations` is not a valid array,
 * or if a critical database operation fails unexpectedly. Invalid individual
 * associations within the array will be skipped with a warning.
 */
export async function putOlAuthorsBooks(associations) {
    // --- Input Validation for the 'associations' array itself ---
    if (!Array.isArray(associations) || associations.length === 0) {
        throw new Error('   - putOlAuthorsBooks: Expected an array of association objects, but received an empty or invalid array.');
    }

    const validAssociations = [];
    const uniqueAuthorOlids = new Set(); // To track which authors need their old books deleted

    for (const assoc of associations) {
        // --- Data Type Defense for each individual association object ---
        if (typeof assoc !== 'object' || assoc === null) {
            console.warn('   - putOlAuthorsBooks: Skipping invalid association entry (not an object).', assoc);
            continue;
        }

        const {
            author_olid,
            edition_olid
        } = assoc;

        // Input validation for individual author_olid
        try {
            const type = utils.validateOlid(author_olid);
            if (type !== 'author') {
                throw new Error(`   - Invalid OLID type for author_olid: Expected 'author', got '${type}'.`);
            }
        } catch (error) {
            console.warn(`   - putOlAuthorsBooks: Skipping association due to invalid author_olid '${author_olid}': ${error.message}`);
            continue;
        }

        // Input validation for individual edition_olid
        try {
            const type = utils.validateOlid(edition_olid);
            if (type !== 'edition') {
                throw new Error(`   - Invalid OLID type for edition_olid: Expected 'edition', got '${type}'.`);
            }
        } catch (error) {
            console.warn(`   - putOlAuthorsBooks: Skipping association due to invalid edition_olid '${edition_olid}': ${error.message}`);
            continue;
        }

        validAssociations.push(assoc);
        uniqueAuthorOlids.add(author_olid); // Collect unique author OLIDs
    }

    if (validAssociations.length === 0) {
        console.log("   - putOlAuthorsBooks: No valid associations found after filtering input array.");
        return []; // No valid associations to insert, return empty array
    }

    try {
        // Step 1: Delete all existing associations for the affected authors
        if (uniqueAuthorOlids.size > 0) {
            const deleteQuery = `
                DELETE FROM authors_books
                WHERE author_olid = ANY($1::text[]);
            `;
            // Convert Set to array for PostgreSQL ANY operator
            await database.query(deleteQuery, [Array.from(uniqueAuthorOlids)]);
            console.log(`   putOlAuthorsBooks: Deleted existing associations for ${uniqueAuthorOlids.size} unique authors.`);
        }

        // Step 2: Insert all new associations (batch insert with ON CONFLICT DO NOTHING)
        const queryValuePlaceholders = [];
        const flattenedQueryValues = [];
        validAssociations.forEach((assoc, index) => {
            const startIdx = index * 2;
            queryValuePlaceholders.push(`($${startIdx + 1}, $${startIdx + 2})`);
            flattenedQueryValues.push(assoc.author_olid, assoc.edition_olid);
        });

        const insertQuery = `
            INSERT INTO authors_books (author_olid, edition_olid)
            VALUES ${queryValuePlaceholders.join(', ')}
            ON CONFLICT (author_olid, edition_olid) DO NOTHING
            RETURNING *;
        `;

        const result = await database.query(insertQuery, flattenedQueryValues);

        const newAssociations = result.rows;

        console.log(`   ... putOlAuthorsBooks: Processed ${validAssociations.length} valid associations. Successfully inserted ${newAssociations.length} new associations.`);
        return newAssociations;

    } catch (error) {
        console.error(`   - Error during synchronization of author-edition associations:`, error);
        throw new Error(`   - Database error synchronizing author-edition associations: ${error.message}`);
    }
}


/**
 * @typedef {Object} EditionLanguageAssociation
 * @property {string} edition_olid - The Open Library ID of the edition.
 * @property {number} language_id - The internal database ID of the language.
 */

/**
 * Synchronizes multiple associations between editions and languages in the database.
 * This function effectively replaces the existing associations for the provided editions:
 * it deletes all current associations for those editions and then inserts the new ones.
 *
 * @param {EditionLanguageAssociation[]} associations - An array of objects, where each object
 * represents an edition-language association to be created.
 * @returns {Promise<EditionLanguageAssociation[]>} A promise that resolves to an array of full row objects for the *newly created* associations.
 * Returns an empty array if no valid associations are provided or inserted.
 * @throws {Error} Throws an error if the input `associations` is not a valid array,
 * or if a critical database operation fails unexpectedly. Invalid individual
 * associations within the array will be skipped with a warning.
 */
export async function putOlEditionsLanguages(associations) {
    // --- Input Validation for the 'associations' array itself ---
    if (!Array.isArray(associations) || associations.length === 0) {
        throw new Error('   - putOlEditionsLanguages: Expected an array of association objects, but received an empty or invalid array.');
    }

    const validAssociations = [];
    const uniqueEditionOlids = new Set(); // To track which editions need their old languages deleted

    for (const assoc of associations) {
        // --- Data Type Defense for each individual association object ---
        if (typeof assoc !== 'object' || assoc === null) {
            console.warn('   - putOlEditionsLanguages: Skipping invalid association entry (not an object).', assoc);
            continue;
        }

        const {
            edition_olid,
            language_id
        } = assoc;

        // Input validation for individual edition_olid
        try {
            const type = utils.validateOlid(edition_olid);
            if (type !== 'edition') {
                throw new Error(`   - putOlEditionsLanguages: Invalid OLID type for edition_olid: Expected 'edition', got '${type}'.`);
            }
        } catch (error) {
            console.warn(`   - putOlEditionsLanguages: Skipping association due to invalid edition_olid '${edition_olid}': ${error.message}`);
            continue;
        }

        // Input validation for individual language_id
        if (typeof language_id !== 'number' || !Number.isInteger(language_id)) {
            console.warn(`   - putOlEditionsLanguages: Skipping association due to invalid language_id '${language_id}'. Must be an integer.`);
            continue;
        }

        validAssociations.push(assoc);
        uniqueEditionOlids.add(edition_olid); // Collect unique edition OLIDs
    }

    if (validAssociations.length === 0) {
        console.log("   - putOlEditionsLanguages: No valid associations found after filtering input array.");
        return []; // No valid associations to insert, return empty array
    }

    try {
        // Step 1: Delete all existing associations for the affected editions
        if (uniqueEditionOlids.size > 0) {
            const deleteQuery = `
                DELETE FROM editions_languages
                WHERE edition_olid = ANY($1::text[]);
            `;
            // Convert Set to array for PostgreSQL ANY operator
            await database.query(deleteQuery, [Array.from(uniqueEditionOlids)]);
            console.log(`   putOlEditionsLanguages: Deleted existing associations for ${uniqueEditionOlids.size} unique editions.`);
        }

        // Step 2: Insert all new associations (batch insert with ON CONFLICT DO NOTHING)
        const queryValuePlaceholders = [];
        const flattenedQueryValues = [];
        validAssociations.forEach((assoc, index) => {
            const startIdx = index * 2;
            queryValuePlaceholders.push(`($${startIdx + 1}, $${startIdx + 2})`);
            flattenedQueryValues.push(assoc.edition_olid, assoc.language_id);
        });

        const insertQuery = `
            INSERT INTO editions_languages (edition_olid, language_id)
            VALUES ${queryValuePlaceholders.join(', ')}
            ON CONFLICT (edition_olid, language_id) DO UPDATE SET
                last_refreshed = CURRENT_TIMESTAMP
            RETURNING *;
        `;

        const result = await database.query(insertQuery, flattenedQueryValues);

        const newAssociations = result.rows;

        console.log(`   putOlEditionsLanguages: Processed ${validAssociations.length} valid associations. Successfully inserted ${newAssociations.length} new associations.`);
        return newAssociations;

    } catch (error) {
        console.error(`   - putOlEditionsLanguages: Error during synchronization of edition-language associations:`, error);
        throw new Error(`   - putOlEditionsLanguages: Database error synchronizing edition-language associations: ${error.message}`);
    }
}


//* --------------------------- *//
//*      Caching functions      *//
//* --------------------------- *//

export async function getOlids() {
    try {
        let query = `
    SELECT work_olid
            FROM book_works
    `
        const worksResult = await database.query(query);
        const works = worksResult.rows.map((work) => {
            return work.work_olid
        })

        query = `
    SELECT edition_olid
            FROM book_editions
    `
        const editionsResult = await database.query(query);
        const editions = editionsResult.rows.map((edition) => {
            return edition.edition_olid
        })

        query = `
    SELECT author_olid
            FROM authors
    `
        const authorsResult = await database.query(query);
        const authors = authorsResult.rows.map((author) => {
            return author.author_olid
        })

        return {
            works: works,
            editions: editions,
            authors: authors
        };

    } catch (error) {
        console.error('Error getting OLIDs from database:', error);
        error.statusCode = error.statusCode || 500; // Preserve existing status or default to 500
        throw error;
    }
}
export async function getSubjects() {
    try {
        let query = `
    SELECT id, name, type
            FROM subjects
    `
        const result = await database.query(query);

        return result.rows;

    } catch (error) {
        console.error('Error getting Subjects from database:', error);
        error.statusCode = error.statusCode || 500; // Preserve existing status or default to 500
        throw error;
    }
}

export async function getStatuses() {
    try {
        let query = `
    SELECT * 
            FROM statuses
            ORDER BY id ASC 
    `
        const result = await database.query(query);

        return result.rows;

    } catch (error) {
        console.error('Error getting Subjects from database:', error);
        error.statusCode = error.statusCode || 500; // Preserve existing status or default to 500
        throw error;
    }
}

export async function getLanguages() {
    try {
        let query = `
    SELECT * 
            FROM languages
            ORDER BY id ASC 
    `
        const result = await database.query(query);

        return result.rows;

    } catch (error) {
        console.error('Error getting Subjects from database:', error);
        error.statusCode = error.statusCode || 500; // Preserve existing status or default to 500
        throw error;
    }
}

/**
 * Checks if a specific item exists in the in-memory caches.
 *
 * @param {('work_olid'|'edition_olid'|'author_olid'|'subject_name_type'|'language_key'|'language_name')} type - The type of item to check.
 * - For OLIDs, use 'work_olid', 'edition_olid', 'author_olid'.
 * - For subjects, use 'subject_name_type'.
 * - For languages, use 'language_key' or 'language_name'.
 * @param {string | Object} data - The data to check against the cache.
 * - For OLIDs, it's the OLID string (e.g., "OL123W").
 * - For 'subject_name_type', it's an object `{ name: string, type: string | null }`.
 * - For 'language_key', it's the language key string (e.g., "/languages/eng").
 * - For 'language_name', it's the language name string (e.g., "English").
 * @returns {boolean} True if the item is found in the cache, false otherwise.
 */
export function checkCache(type, data) {
    // --- Data Type Defense for 'type' parameter ---
    if (typeof type !== 'string') {
        console.warn('checkCache: Invalid "type" parameter provided. Expected a string.', {
            type,
            data
        });
        return false;
    }

    switch (type) {
        case 'work_olid':
        case 'edition_olid':
        case 'author_olid':
            if (typeof data !== 'string') {
                console.warn(`checkCache: Invalid "data" for type '${type}'. Expected a string OLID.`, {
                    type,
                    data
                });
                return false;
            }
            try {
                // Defensive: Ensure the OLID itself is valid
                utils.validateOlid(data); // This throws if invalid, caught below
            } catch (error) {
                console.warn(`checkCache: Invalid OLID format for type '${type}'. ${error.message}`, {
                    type,
                    data
                });
                return false;
            }

            // Use Set.has() for O(1) lookup
            if (type === 'work_olid') {
                return cachedOlids.works.has(data);
            } else if (type === 'edition_olid') {
                return cachedOlids.editions.has(data);
            } else { // type === 'author_olid'
                return cachedOlids.authors.has(data);
            }

        case 'subject_name_type': // New type to explicitly indicate checking by name AND type
            if (!data || typeof data !== 'object' || typeof data.name !== 'string') {
                console.warn(`checkCache: Invalid "data" for type '${type}'. Expected object { name: string, type: string | null }.`, {
                    type,
                    data
                });
                return false;
            }
            const subjectKey = `${data.name}|${data.type || ''}`;
            return cachedSubjects.has(subjectKey);

        case 'language_key':
            if (typeof data !== 'string' || data.trim() === '') {
                console.warn(`checkCache: Invalid "data" for type '${type}'. Expected a non-empty string.`, {
                    type,
                    data
                });
                return false;
            }
            return cachedLanguages.has(data); // Use Map.has() for O(1) lookup

        case 'language_name': // Assuming you want to check by language name too
            if (typeof data !== 'string' || data.trim() === '') {
                console.warn(`checkCache: Invalid "data" for type '${type}'. Expected a non-empty string.`, {
                    type,
                    data
                });
                return false;
            }
            // For checking by language name, we still need to iterate the Map's values
            // or maintain another Map if this is a very frequent lookup.
            for (const lang of cachedLanguages.values()) {
                if (lang.language && lang.language.toLowerCase() === data.toLowerCase()) {
                    return true;
                }
            }
            return false;

        default:
            console.warn(`checkCache: Unknown cache type specified: '${type}'. No check performed.`, {
                type,
                data
            });
            return false;
    }
}

/**
 * Updates the in-memory caches (cachedOlids, cachedSubjects, cachedLanguages) with new Open Library data.
 * This function adds new OLIDs (for editions, works, authors), complete subject objects,
 * or complete language objects to their respective caches if they are not already present.
 * It uses Sets for OLID caches for efficient O(1) average-time lookups.
 *
 * @param {('edition'|'work'|'author'|'subject'|'language')} type - The type of item being cached.
 * @param {string | null} olid - The Open Library ID (OLID) of the item. Required for 'edition', 'work', and 'author' types.
 * For 'subject' and 'language' types, this parameter is expected to be null and is ignored.
 * @param {Object | null} [data=null] - Optional. The data object to be cached.
 * - For 'subject' type, it must be an object like `{id: number, name: string, type: string | null}`.
 * - For 'language' type, it must be an object like `{id: number, language: string, key: string}`.
 * - It is ignored for 'edition', 'work', and 'author' types.
 * @returns {void}
 * @throws {Error} Throws an error if required parameters are missing or invalid for the given type.
 */
export function updateCache(type, olid = null, data = null) {
    // Basic validation for 'type'
    const validTypes = ['editions', 'works', 'authors', 'subject', 'language'];
    if (!validTypes.includes(type)) {
        console.warn(`updateCache: Attempted to update cache with unknown or invalid type: '${type}'. Skipping.`);
        return;
    }

    switch (type) {
        case 'editions':
        case 'works':
        case 'authors':
            // Validate OLID for these types
            if (typeof olid !== 'string' || olid.trim() === '') {
                console.warn(`updateCache: Invalid or missing OLID for type '${type}'. Must be a non-empty string. Skipping.`);
                return;
            }
            // Ensure cachedOlids structure for the specific type is a Set
            if (!(cachedOlids[type] instanceof Set)) {
                console.error(`updateCache: cachedOlids.${type} is not initialized as a Set. Re-initializing.`);
                cachedOlids[type] = new Set();
            }

            if (!cachedOlids[type].has(olid)) {
                cachedOlids[type].add(olid);
                // console.log(`Cache updated: Added ${type} OLID: ${olid}`); // Uncomment for detailed logging
            }
            break;

        case 'subject':
            // data = {id: number, name: string, type: string}
            // Validate data object for 'subject'
            if (!data || typeof data !== 'object' || data === null ||
                typeof data.id !== 'number' || !Number.isInteger(data.id) ||
                typeof data.name !== 'string' || data.name.trim() === '' ||
                (data.type !== null && typeof data.type !== 'string')) { // Type can be null or string
                console.warn(`updateCache: Invalid data object for 'subject' type. Expected {id: number, name: string, type: string | null}. Skipping. Data:`, data);
                return;
            }

            // Construct the unique key for the Map
            const subjectKey = `${data.name}|${data.type || 'Ungrouped'}`;

            // Ensure cachedSubjects is initialized as a Map
            if (!(cachedSubjects instanceof Map)) {
                console.error(`updateCache: cachedSubjects is not initialized as a Map. Re-initializing.`);
                cachedSubjects = new Map();
            }

            // Check if subject already exists by its unique key in the Map
            if (!cachedSubjects.has(subjectKey)) {
                cachedSubjects.set(subjectKey, data); // Store the full data object
                // console.log(`Cache updated: Added subject: ${data.name} (ID: ${data.id})`);  // Uncomment for detailed logging
            }
            break;

        case 'language':

            // Validate data object for 'language'
            if (!data || typeof data !== 'object' || data === null ||
                typeof data.id !== 'number' || !Number.isInteger(data.id) ||
                typeof data.language !== 'string' || data.language.trim() === '' ||
                typeof data.key !== 'string' || data.key.trim() === '') {
                console.warn(`updateCache: Invalid data object for 'language' type. Expected {id: number, language: string, key: string}. Skipping. Data:`, data);
                return;
            }

            // Ensure cachedLanguages is initialized as a Map
            if (!(cachedLanguages instanceof Map)) {
                console.error(`updateCache: cachedLanguages is not initialized as a Map. Re-initializing.`);
                cachedLanguages = new Map();
            }

            // Check if language already exists by its unique key in the Map
            if (!cachedLanguages.has(data.key)) {
                cachedLanguages.set(data.key, data); // Store the full data object
                // console.log(`Cache updated: Added language: ${data.language} (Key: ${data.key})`); // Uncomment for detailed logging
            }
            break;
    }
}

export async function updateTrendingReelData(period, desiredLimit = 20) {
    console.log('> Starting trending cache update...')
    try {
        if (!period) {
            console.error('updateTrendingReelData: Missing period. This call requires a period to be passed')
            throw new Error('updateTrendingReelData: no period was provided')
        }

        // fetch Trend data from the database (if it exists)
        const latestEntriesFromDb = await getTrendingBooksReelData(period);
        const currentDate = new Date();

        let hoursBeforeRefresh;
        switch (period) {
            case 'hourly':
                hoursBeforeRefresh = 1;
                break;
            case 'daily':
                hoursBeforeRefresh = 24;
                break;
            default:
                console.warn(`   ...Unknown trending period '${period}'. Skipping update.`);
                return;
        }

        let needsDataFetchFromOL = false;
        let dataToCacheAndDb = null;
        let latestDbEntryForPeriod = null; // Initialize to null

        if (latestEntriesFromDb && latestEntriesFromDb.length > 0) {
            // Only attempt to find the specific period's entry if there's any data from DB
            latestDbEntryForPeriod = latestEntriesFromDb.find(entry => entry.period === period);

            if (latestDbEntryForPeriod) {
                // If an entry for the specific period is found, check its staleness
                const latestDbEntryDate = new Date(latestDbEntryForPeriod.last_updated);
                const hoursSinceLastDbUpdate = Math.floor(Math.abs(currentDate.getTime() - latestDbEntryDate.getTime()) / 36e5);

                if (hoursSinceLastDbUpdate >= hoursBeforeRefresh) {
                    console.log(`   Cached database data for period '${period}' is stale (${hoursSinceLastDbUpdate} hours old). Refreshing from OL.`);
                    needsDataFetchFromOL = true;
                } else {
                    console.log(`   Cached database data for period '${period}' is fresh (${hoursSinceLastDbUpdate} hours old). Updating in-memory cache from DB.`);

                    // Assuming cachedTrending is defined globally or imported
                    cachedTrending = {
                        data: latestDbEntryForPeriod.data,
                        lastUpdate: currentDate
                    };

                }
            } else {
                // If getTrendingBooksReelData returned data, but no entry for THIS period was found
                console.log(`   No cached entry for period '${period}' found in existing database data. Will fetch new data from OL.`);
                needsDataFetchFromOL = true;
            }
        } else {
            // This block executes if getTrendingBooksReelData returned null or an empty array
            console.log(`   No cached data found in database. Initial fetch from Open Library for period '${period}'.`);
            needsDataFetchFromOL = true;
        }

        if (needsDataFetchFromOL) {
            console.log(`   Attempting to fetch new trending data from Open Library`);
            try {
                const rawTrendingDataFromOL = await ol.getOlData('trending');

                // Ensure data is an array and not empty before processing
                if (Array.isArray(rawTrendingDataFromOL) && rawTrendingDataFromOL.length > 0) {
                    const limitedData = rawTrendingDataFromOL.slice(0, desiredLimit);

                    // --- START PARALLEL PROCESSING FOR IMAGES AND WORK OLIDS ---

                    // Step 1: Determine all image URLs (may involve async OL searches)
                    const worksWithDeterminedImageUrlsPromises = limitedData.map(async (work) => {
                        let imageUrl = '';
                        if (typeof work.cover_edition_key === 'string' && work.cover_edition_key.length > 0) {
                            imageUrl = "https://covers.openlibrary.org/b/olid/" + work.cover_edition_key + "-M.jpg";
                        } else if (typeof work.cover_i === 'number' && work.cover_i > 0) {
                            imageUrl = "https://covers.openlibrary.org/b/id/" + work.cover_i + "-M.jpg";
                        } else {
                            // Fallback: Search for image if cover_edition_key or cover_i are missing
                            const findImageSearch = await ol.getOlData('search', work.title, 1, null); // language is null for trending
                            const findImageSearchData = findImageSearch.docs && findImageSearch.docs.length > 0 ? findImageSearch.docs[0] : null;

                            if (findImageSearchData) {
                                if (typeof findImageSearchData.cover_edition_key === 'string' && findImageSearchData.cover_edition_key.length > 0) {
                                    imageUrl = "https://covers.openlibrary.org/b/olid/" + findImageSearchData.cover_edition_key + "-M.jpg";
                                } else if (typeof findImageSearchData.cover_i === 'number' && findImageSearchData.cover_i > 0) {
                                    imageUrl = "https://covers.openlibrary.org/b/id/" + findImageSearchData.cover_i + "-M.jpg";
                                }
                            }
                        }
                        // Return the work object along with the determined imageUrl for the next step
                        return {
                            ...work,
                            _determinedImageUrl: imageUrl
                        };
                    });

                    const worksWithUrls = await Promise.all(worksWithDeterminedImageUrlsPromises);

                    // Step 2: Collect all determined image URLs into a single array for batch fetching by fh.getOlImage
                    const imageUrlsForBatchFetch = worksWithUrls.map(work => work._determinedImageUrl);

                    let fetchedImageResults = [];
                    // Only call getOlImage if there are valid URLs to fetch, to avoid unnecessary calls or errors.
                    if (imageUrlsForBatchFetch.some(url => url && url.length > 0)) {
                        fetchedImageResults = await fh.getOlImage('edition', imageUrlsForBatchFetch);
                    } else {
                        console.log('No valid image URLs found for batch fetching in trending data.');
                    }


                    // Step 3: Map the fetched image results back to the work objects and assign work_olid
                    dataToCacheAndDb = worksWithUrls.map((work, index) => {
                        const imageResultForThisWork = fetchedImageResults[index];
                        let finalCoverUrl = null;
                        if (imageResultForThisWork) {
                            finalCoverUrl = imageResultForThisWork.localPath;
                        }

                        // Assign the processed cover URL
                        work.cover_url = finalCoverUrl;

                        // Assign work_olid
                        work.work_olid = utils.formatPrefix('works', [{
                            key: work.key
                        }]);

                        // Remove the temporary _determinedImageUrl before caching/saving to DB
                        delete work._determinedImageUrl;

                        return work; // Return the modified work object
                    });
                    // --- END PARALLEL PROCESSING ---

                    console.log(`   + Successfully processed and fetched new data for period '${period}'.`);

                } else {
                    console.warn(`   - ol.getOlData('trending') returned empty or non-array data for period '${period}'.`);
                    // If OL returns no data, try to use existing DB data if any.
                    if (latestDbEntryForPeriod) {
                        // Assuming cachedTrending is defined globally or imported
                        cachedTrending = {
                            data: latestDbEntryForPeriod.data,
                            lastUpdate: currentDate
                        };
                        console.log(`   Reverted to previous database cache for period '${period}' due to empty OL fetch.`);
                    } else {
                        // Assuming cachedTrending is defined globally or imported
                        cachedTrending = null; // No prior data, in-memory cache remains empty
                    }
                    return; // Exit, nothing to update DB with
                }
            } catch (olError) {
                console.error(`Failed to fetch trending data from Open Library for period '${period}'. Using existing cache if available.`, olError);
                // If OL fetch fails, and we have existing DB data, use that to keep cache populated.
                if (latestDbEntryForPeriod) {
                    // Assuming cachedTrending is defined globally or imported
                    cachedTrending = {
                        data: latestDbEntryForPeriod.data,
                        lastUpdate: currentDate
                    };

                    console.log(`Reverted to previous database cache for period '${period}' due to OL fetch failure.`);
                } else {
                    // Assuming cachedTrending is defined globally or imported
                    cachedTrending = null; // No prior data, in-memory cache remains empty
                }
                return; // Exit this update attempt, preventing database operation on potentially bad data
            }

            // Update the in-memory cache with the new, processed data
            // Assuming cachedTrending is defined globally or imported
            cachedTrending = {
                data: dataToCacheAndDb, // This is the processed array of objects
                lastUpdate: currentDate
            };


            const upsertQuery = `
                INSERT INTO cached_trending_data (period, data, last_updated)
                VALUES ($1, $2, NOW())
                ON CONFLICT (period) DO UPDATE
                SET data = EXCLUDED.data, last_updated = EXCLUDED.last_updated;
            `;
            // Ensure data is stringified for DB storage
            const upsertData = [period, JSON.stringify(dataToCacheAndDb)];

            try {
                await database.query(upsertQuery, upsertData);
                console.log(`Database and in-memory cache updated for period '${period}'.`);
            } catch (dbError) {
                console.error(`Failed to update database for period '${period}'. In-memory cache may be newer.`, dbError);
                // Error logged, but no re-throw to keep the server running. In-memory cache is still fresh.
            }
        }
        console.log('   ...Trending cache update complete')

    } catch (error) {
        console.error(`Error updating trending data into database:`, error);
        throw error;
    }
}

export async function updateSubjectReelData(subject, language = null, desiredLimit = 10) {

    try {

        if (!subject) {
            console.error('updateSubjectReelData: Missing subject. This call requires a subject to be passed')
            throw new Error('updateSubjectReelData: no subject was provided')
        }
        console.log(`> Starting subject: ${subject} cache update...`)

        // fetch Subject data from the database (if it exists)
        language = language || "eng"; // Ensure language is set for search queries
        const latestEntriesFromDb = await getSubjectsReelData(subject, language);
        const currentDate = new Date();

        let hoursBeforeRefresh = 1;

        let needsDataFetchFromOL = false;
        let dataToCacheAndDb = null;

        if (latestEntriesFromDb) {
            // If an entry is found, check its staleness
            const latestDbEntryDate = new Date(latestEntriesFromDb.last_updated);
            const hoursSinceLastDbUpdate = Math.floor(Math.abs(currentDate.getTime() - latestDbEntryDate.getTime()) / 36e5);

            if (hoursSinceLastDbUpdate >= hoursBeforeRefresh) {
                console.log(`   Cached database data for subject '${subject}' is stale (${hoursSinceLastDbUpdate} hours old). Refreshing from OL.`);
                needsDataFetchFromOL = true;
            } else {
                console.log(`   Cached database data for subject '${subject}' is fresh (${hoursSinceLastDbUpdate} hours old). Updating in-memory cache from DB.`);

                // Assuming cachedBrowseSubjects is defined globally or imported
                cachedBrowseSubjects[subject] = {
                    data: latestEntriesFromDb.data,
                    lastUpdate: currentDate
                };

            }

        } else {
            // This block executes if updateSubjectReelData returned null or an empty array
            console.log(`   No cached data found in database. Initial fetch from Open Library for subject '${subject}'.`);
            needsDataFetchFromOL = true;
        }

        if (needsDataFetchFromOL) {
            console.log(`   Attempting to fetch new subject data from Open Library`);
            try {
                const rawSubjectDataFromOL = await ol.getOlData('subject', subject, 1, language, desiredLimit);
                // Ensure data is an array and not empty before processing
                if (Array.isArray(rawSubjectDataFromOL.docs) && rawSubjectDataFromOL.docs.length > 0) {
                    const limitedData = rawSubjectDataFromOL.docs;

                    // --- START PARALLEL PROCESSING FOR IMAGES AND WORK OLIDS ---

                    // Step 1: Determine all image URLs (may involve async OL searches)
                    const worksWithDeterminedImageUrlsPromises = limitedData.map(async (work) => {
                        let imageUrl = '';
                        if (typeof work.cover_edition_key === 'string' && work.cover_edition_key.length > 0) {
                            imageUrl = "https://covers.openlibrary.org/b/olid/" + work.cover_edition_key + "-M.jpg";
                        } else if (typeof work.cover_i === 'number' && work.cover_i > 0) {
                            imageUrl = "https://covers.openlibrary.org/b/id/" + work.cover_i + "-M.jpg";
                        } else {
                            // Fallback: Search for image if cover_edition_key or cover_i are missing
                            const findImageSearch = await ol.getOlData('search', work.title, 1, language);
                            const findImageSearchData = findImageSearch.docs && findImageSearch.docs.length > 0 ? findImageSearch.docs[0] : null;

                            if (findImageSearchData) {
                                if (typeof findImageSearchData.cover_edition_key === 'string' && findImageSearchData.cover_edition_key.length > 0) {
                                    imageUrl = "https://covers.openlibrary.org/b/olid/" + findImageSearchData.cover_edition_key + "-M.jpg";
                                } else if (typeof findImageSearchData.cover_i === 'number' && findImageSearchData.cover_i > 0) {
                                    imageUrl = "https://covers.openlibrary.org/b/id/" + findImageSearchData.cover_i + "-M.jpg";
                                }
                            }
                        }
                        // Return the work object along with the determined imageUrl for the next step
                        return {
                            ...work,
                            _determinedImageUrl: imageUrl
                        };
                    });

                    const worksWithUrls = await Promise.all(worksWithDeterminedImageUrlsPromises);

                    // Step 2: Collect all determined image URLs into a single array for batch fetching by fh.getOlImage
                    const imageUrlsForBatchFetch = worksWithUrls.map(work => work._determinedImageUrl);

                    let fetchedImageResults = [];
                    // Only call getOlImage if there are valid URLs to fetch, to avoid unnecessary calls or errors.
                    if (imageUrlsForBatchFetch.some(url => url && url.length > 0)) {
                        fetchedImageResults = await fh.getOlImage('edition', imageUrlsForBatchFetch);
                    } else {
                        console.log(`No valid image URLs found for batch fetching for subject '${subject}'.`);
                    }

                    // Step 3: Map the fetched image results back to the work objects and assign work_olid
                    dataToCacheAndDb = worksWithUrls.map((work, index) => {
                        const imageResultForThisWork = fetchedImageResults[index];
                        let finalCoverUrl = null;
                        if (imageResultForThisWork) {
                            finalCoverUrl = imageResultForThisWork.localPath;
                        }

                        // Assign the processed cover URL
                        work.cover_url = finalCoverUrl;

                        // Assign work_olid
                        work.work_olid = utils.formatPrefix('works', [{
                            key: work.key
                        }]);

                        // Remove the temporary _determinedImageUrl before caching/saving to DB
                        delete work._determinedImageUrl;

                        return work; // Return the modified work object
                    });
                    // --- END PARALLEL PROCESSING ---

                    console.log(`   + Successfully processed and fetched new data for subject (${subject}).`);

                } else {
                    console.warn(`   - ol.getOlData('subject') returned empty or non-array data for subject (${subject}).`);
                    // If OL returns no data, try to use existing DB data if any.
                    if (latestEntriesFromDb) {
                        // Assuming cachedBrowseSubjects is defined globally or imported
                        cachedBrowseSubjects[subject] = {
                            data: latestEntriesFromDb.data,
                            lastUpdate: currentDate
                        };
                        console.log(`   Reverted to previous database cache for subject (${subject}) due to empty OL fetch.`);
                    } else {
                        // Assuming cachedBrowseSubjects is defined globally or imported
                        cachedBrowseSubjects[subject] = {
                            data: [], // No prior data, in-memory cache remains empty
                            lastUpdate: currentDate
                        }
                    }
                    return; // Exit, nothing to update DB with
                }
            } catch (olError) {
                console.error(`Failed to fetch data from Open Library for subject (${subject}). Using existing cache if available.`, olError);
                // If OL fetch fails, and we have existing DB data, use that to keep cache populated.
                if (latestEntriesFromDb) {
                    // Assuming cachedBrowseSubjects is defined globally or imported
                    cachedBrowseSubjects[subject] = {
                        data: latestEntriesFromDb.data,
                        lastUpdate: currentDate
                    };

                    console.log(`Reverted to previous database cache for subject (${subject}) due to OL fetch failure.`);
                } else {
                    // Assuming cachedBrowseSubjects is defined globally or imported
                    cachedBrowseSubjects[subject] = {
                        data: [], // No prior data, in-memory cache remains empty
                        lastUpdate: currentDate
                    }
                }
                return; // Exit this update attempt, preventing database operation on potentially bad data
            }

            // Update the in-memory cache with the new, processed data
            // Assuming cachedBrowseSubjects is defined globally or imported
            cachedBrowseSubjects[subject] = {
                data: dataToCacheAndDb, // This is the processed array of objects
                lastUpdate: currentDate
            };

            const upsertQuery = `
                INSERT INTO cached_subject_data (subject_name, language, data, last_updated)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (subject_name, language) DO UPDATE
                SET data = EXCLUDED.data, last_updated = EXCLUDED.last_updated;
            `;
            // Ensure data is stringified for DB storage
            const upsertData = [subject, language, JSON.stringify(dataToCacheAndDb)];

            try {
                await database.query(upsertQuery, upsertData);
                console.log(`   Database and in-memory cache updated for subject '${subject}'.`);
            } catch (dbError) {
                console.error(`   ...Failed to update database for subject '${subject}'. In-memory cache may be newer.`, dbError);
                // Error logged, but no re-throw to keep the server running. In-memory cache is still fresh.
            }
        }
        console.log(`   ...subject (${subject}) cache update complete`)

    } catch (error) {
        console.error(`Error updating subject (${subject}) data into database:`, error);
        throw error;
    }
}

export async function updateLanguages() {
    try {
        console.log("> Starting language cache update...");
        // 1. Get all languages currently in your database
        const dbLanguages = await getLanguages();

        // 2: Populate the in-memory cache with languages already in the database.
        // Re-initialize cachedLanguages as a Map before populating from DB to ensure it's a Map
        cachedLanguages.clear(); // Clear existing entries in the Map
        languageNameToIdMap.clear()
        console.log(`   Populating in-memory cache with ${dbLanguages.length} existing languages...`);
        dbLanguages.forEach(dbLang => {
            const languageToCache = {
                ...dbLang,
                id: parseInt(dbLang.id)
            };
            cachedLanguages.set(languageToCache.key, languageToCache); // Add to Map using 'key' as the Map key
            languageNameToIdMap.set(languageToCache.language, languageToCache.id); // Add to Map using 'language' as the Map key
        });

        console.log("   In-memory language cache populated with existing data.");

        // Create a Set for efficient lookup of existing language keys
        const dbLanguageKeys = new Set(dbLanguages.map(lang => lang.key)); // This Set is temporary for this function


        // 3. Get all languages from Open Library
        const olLanguages = await ol.getOlData('languages');
        console.log(`   Fetched ${olLanguages.length} languages from Open Library.`);

        const languagesToInsert = []; // This will hold the language objects to insert (just key and language for postOlLanguages)

        // 4. Identify new languages not in the database
        olLanguages.forEach(olLang => {
            // Defensive check: ensure olLang and olLang.key exist and are strings
            if (olLang && typeof olLang.key === 'string' && typeof olLang.language === 'string') {
                if (!dbLanguageKeys.has(olLang.key)) {
                    languagesToInsert.push({
                        language: olLang.language,
                        key: olLang.key
                    });
                }
            } else {
                console.warn('  *Skipping malformed Open Library language object during update:', olLang);
            }
        });

        // 5. Perform a batch insertion for all new languages
        if (languagesToInsert.length > 0) {
            console.log(`   Found ${languagesToInsert .length} new languages to insert into the database.`);
            try {
                const newlyInsertedLanguages = await postOlLanguages(languagesToInsert);
                newlyInsertedLanguages.forEach(newLang => {
                    const languageToCache = {
                        ...newLang,
                        id: parseInt(newLang.id)
                    };
                    cachedLanguages.set(languageToCache.key, languageToCache);
                    languageNameToIdMap.set(languageToCache.language, languageToCache.id);
                });
                console.log(`   Successfully inserted ${newlyInsertedLanguages.length} new languages into the database and cache.`);
            } catch (error) {
                console.error(`  *Failed to batch insert languages:`, error.message);
                throw error;
            }
        } else {
            console.log("   All Open Library languages already exist in the database. No new languages to insert.");
        }

        console.log("   ... Language cache update successful.");

    } catch (error) {
        console.error('  *Error during language cache update in updateLanguages:', error);
        throw error;
    }
}

export function logCurrentCache() {
    console.log('--- Current Cache Status ---');

    console.log('Cached Olids:');
    // For Sets, we can directly log their size and then convert to an array for display if needed.
    console.log(`  Editions (${cachedOlids.editions.size}): ${[...cachedOlids.editions].join(', ')}`);
    console.log(`  Works (${cachedOlids.works.size}): ${[...cachedOlids.works].join(', ')}`);
    console.log(`  Authors (${cachedOlids.authors.size}): ${[...cachedOlids.authors].join(', ')}`);

    console.log('\nCached Subjects:');
    // For Maps, convert values to an array for console.table
    // Make sure the objects in the map have an 'id' or a unique key for console.table to group by.
    // If you want to index by original ID, you'd need to rebuild the object.
    // The previous reduce was designed for arrays. For Maps, iterate values directly.
    const transformedCachedSubjects = {};
    Array.from(cachedSubjects.values()).forEach(subject => {
        if (subject.id) { // Ensure subject has an ID to use as key in the object
            const {
                id,
                ...rest
            } = subject;
            transformedCachedSubjects[id] = rest;
        } else {
            // Fallback if id is missing, use a generated key or just push to an array
            console.warn("Subject in cache missing 'id', logging without ID key:", subject);
            //transformedCachedSubjects[`${subject.name}|${subject.type || ''}`] = subject;
        }
    });
    // Only call console.table if there are subjects to display
    if (Object.keys(transformedCachedSubjects).length > 0) {
        console.table(transformedCachedSubjects);
    } else {
        console.log('  (empty)');
    }


    console.log('\nCached Statuses:');
    // cachedStatuses is still an array, so your original reduce logic applies
    const transformedCachedStatuses = cachedStatuses.reduce((statuses, {
        id,
        ...x
    }) => {
        statuses[id] = x;
        return statuses
    }, {});
    if (Object.keys(transformedCachedStatuses).length > 0) {
        console.table(transformedCachedStatuses);
    } else {
        console.log('  (empty)');
    }

    console.log('\nCached Languages (by ID):');
    const transformedCachedLanguagesById = {};
    Array.from(cachedLanguages.values()).forEach(language => {
        if (language.id) {
            const {
                id,
                ...rest
            } = language;
            transformedCachedLanguagesById[id] = rest;
        } else {
            console.warn("Language in cache missing 'id', logging without ID key:", language);
        }
    });
    if (Object.keys(transformedCachedLanguagesById).length > 0) {
        console.table(transformedCachedLanguagesById);
    } else {
        console.log('   (empty)');
    }

    console.log('\nCached Languages (Name to ID Map):');
    if (languageNameToIdMap.size > 0) {
        const transformedLanguageNameToIdMap = {};
        languageNameToIdMap.forEach((id, name) => {
            transformedLanguageNameToIdMap[name] = id;
        });
        console.table(transformedLanguageNameToIdMap);
    } else {
        console.log('   (empty)');
    }


    console.log('--- End Cache Status ---');
}

export async function initDbAndCache(subjects = [], subjectLanguage, subjectReelLength) {
    try {
        console.log(`\nInitializing database and in-memory caches...`);


        // initialize core caches
        const [statuses, subjectsFromDb, olidsFromDb] = await Promise.all([
            getStatuses(),
            getSubjects(),
            getOlids(),
        ]);

        // Populate cachedStatuses
        console.log("> Starting status cache update...");
        cachedStatuses = statuses;
        console.log(`    ... status cache update complete.`);

        // Populate cachedSubjects (convert to Map)
        console.log("> Starting subjects cache update...");
        cachedSubjects.clear();
        cachedSubjects = new Map();
        console.log(`    Populating in-memory cache with ${subjectsFromDb.length} existing subjects...`);
        subjectsFromDb.forEach(subject => {
            const key = `${subject.name}|${subject.type || '--Ungrouped--'}`;
            cachedSubjects.set(key, subject);
        });
        // console.log(`    ${cachedSubjects.size} subjects loaded.`);

        console.log(`    ... subjects cache update complete.`);

        // Populate cachedOlids (Sets)
        cachedOlids.editions.clear(); // Clear existing to ensure fresh populate
        cachedOlids.works.clear();
        cachedOlids.authors.clear();
        console.log("> Starting olid cache update...");
        if (olidsFromDb && olidsFromDb.editions && Array.isArray(olidsFromDb.editions)) {

            olidsFromDb.editions.forEach(olid => cachedOlids.editions.add(olid));
        } else {
            console.warn("initDbAndCache: getOlids() did not return expected 'editions' array. Cached editions may be incomplete.");
        }
        if (olidsFromDb && olidsFromDb.works && Array.isArray(olidsFromDb.works)) {
            olidsFromDb.works.forEach(olid => cachedOlids.works.add(olid));
        } else {
            console.warn("initDbAndCache: getOlids() did not return expected 'works' array. Cached works may be incomplete.");
        }
        if (olidsFromDb && olidsFromDb.authors && Array.isArray(olidsFromDb.authors)) {
            olidsFromDb.authors.forEach(olid => cachedOlids.authors.add(olid));
        } else {
            console.warn("initDbAndCache: getOlids() did not return expected 'authors' array. Cached authors may be incomplete.");
        }
        console.log(`    ... olid cache update complete.`);

        // This function updates the DB from OL, and updates cachedLanguages Map.
        await updateLanguages()
        await updateTrendingReelData('daily')
        for (const subject of subjects) {
            await updateSubjectReelData(subject, subjectLanguage, subjectReelLength)
        }
        console.log('+ Database caches populated successfully.');
    } catch (error) {
        console.error(' *Failed to initialize database caches:', error);
        throw error;
    }
}