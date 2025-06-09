// This file is /utils/db-handler.js
import {
    database
} from './database.js';
import * as ol from './ol-handler.js'
import * as utils from './utils.js'
export let cachedStatuses = []; // Will be populated by initDbAndCache
export let cachedSubjects = []; // Will be populated by initDbAndCache
export let cachedLanguages = []; // Will be populated by initDbAndCache
export let cachedOlids = {}; // Will be populated by initDbAndCache

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
// getEdition:
export async function getEdition(edition_olid) {
    // Response:
    //     {
    //     "edition_olid": edition_olid,
    //     "work_olid": work_olid,
    //     "title": title,
    //     "publish_date": publish_date,
    //     "description": description,
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
                be.publish_date,
                be.description,
                be.cover_url
            FROM book_editions AS be
            WHERE be.edition_olid = $1;
        `;
        const data = [edition_olid];
        const result = await database.query(query, data);

        return result.rows || null;

    } catch (error) {
        console.error(`Error getting book: (${edition_olid})s from database:`, error);
        throw new Error(`Database error getting book: (${edition_olid}): ${error.message}`);
    }

}

// getUserBooks:
export async function getUserBooks(user_id) {
    // Response:
    //     {
    //     "user_id": user_id,
    //     "edition_olid": edition_olid,
    //     "work_olid": work_olid,
    //     "title": title,
    //     "publish_date": publish_date,
    //     "description": description,
    //     "cover_url": cover_url,
    //     "status_id": status_id,
    //     "authors": [authors]   //output from getEditionAuthors
    //      "languages": [languages]  //output from getEditionLanguages
    //     }
    // Throws an error on failure during database operations
    // Returns null when editions for that user are not found
    try {
        const query = `
            SELECT 
                ub.user_id, 
                ub.edition_olid, 
                be.work_olid, 
                be.title, 
                be.publish_date, 
                be.description, 
                be.cover_url, 
                ub.status_id 
            FROM users_books AS ub
            JOIN book_editions AS be ON ub.edition_olid = be.edition_olid
            WHERE ub.user_id = $1;
        `;
        const data = [user_id];
        const result = await database.query(query, data);
        
        const booksFromDb = result.rows;
        // If no books are found, return null immediately
        if (booksFromDb.length === 0) {
            return null;
        }

        // Create an array of promises for fetching authors AND languages for each book in parallel
        const bookDetailsPromises = booksFromDb.map(async (book) => {
            const [bookAuthors, bookLanguages] = await Promise.all([
                getEditionAuthors(book.edition_olid),
                getEditionLanguages(book.edition_olid)
            ]);

            return {
                ...book,
                authors: bookAuthors,
                languages: bookLanguages // Add the languages here
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

        // Map subject_id to status string using the cachedSubjects
        const workSubjectsWithSubjectNames = result.rows.map(book => {
            const subject = cachedSubjects.find(s => s.id === book.subject_id);
            return {
                ...book,
                subject: subject.name ? subject.name : 'Unknown', // Handle case where subject name might not be found (shouldn't happen if data is clean)
                subject_id: undefined
            };
        });

        return workSubjectsWithSubjectNames.length > 0 ? workSubjectsWithSubjectNames : null;

    } catch (error) {
        console.error(`Error getting book's (${work_olid}) subjects from database:`, error);
        throw new Error(`Database error getting book's (${work_olid}) subjects: ${error.message}`);
    }
}

//getEditionLanguages
export async function getEditionLanguages(edition_olid) {
    // Response:
    //      [ language, language, ... ]
    // Throws an error on failure during database operations
    // Returns [] when edition is not found
    try {
        const query = `
            SELECT 
                edition_olid, 
                language_id
            FROM editions_languages
            WHERE edition_olid = $1;
        `;
        const data = [edition_olid];
        const result = await database.query(query, data);

        if (result.rows.length === 0) {
            return [];
        }

        const editionWithLanguageDetials = result.rows.map(l => {
            const language = utils.languageLookup('id', l.language_id, 'language');

            return language || null; // Handle case where language might not be found (shouldn't happen if data is clean)
        });

        return editionWithLanguageDetials;

    } catch (error) {
        console.error(`Error getting languages for (${edition_olid}) from database:`, error);
        throw new Error(`Database error getting languages for (${edition_olid}): ${error.message}`);
    }
}

// getUserReviews:
export async function getUserReviews(user_id) {
    // Response:
    //     {
    //     "edition_olid": edition_olid,
    //     "review_id": review_id,
    //      "review": review,
    //     "score": score
    // Throws an error on failure during database operations
    // Returns null when the user review is not found
    try {
        const query = `
            SELECT
                ub.edition_olid,
                br.id as review_id, 
                br.review,
                br.score
            FROM users_books AS ub
            JOIN book_review AS br ON ub.id = br.user_book_id
            WHERE ub.user_id = $1;
        `;
        const data = [user_id];
        const result = await database.query(query, data);

        return result.rows || null;

    } catch (error) {
        console.error(`Error getting user (${user_id})'s reviews from database:`, error);
        throw new Error(`Database error getting user (${user_id})'s reviews: ${error.message}`);
    }
}

//* --------------------------- *//
//*   Book (insert) functions   *//
//*   (Data from Open Library)  *//
//* --------------------------- *//


export async function putOlWork(work_olid, title, first_publication_date) {
    try {
        let query = `
     INSERT INTO book_works (work_olid, title, first_publication_date)
     VALUES ($1, $2, $3)
     RETURNING work_olid;       
    `
        let data = [work_olid, title, first_publication_date]

        const Result = await database.query(query, data);

        return Result.rows[0]?.work_olid || null; // Return the work_olid if available otherwise null indicates failure

    } catch (error) {
        console.error(`Error writing work ${work_olid} to database:`, error);
        throw new Error(`Database error storing work ${work_olid}: ${error.message}`);
    }
}

export async function putOlAuthor(author_olid, name, bio, birth_date, death_date, pic_url) {
    try {
        let query = `
     INSERT INTO authors (author_olid, name, bio, birth_date, death_date, pic_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING author_olid;             
    `
        let data = [author_olid, name, bio, birth_date, death_date, pic_url]

        const Result = await database.query(query, data);

        return Result.rows[0]?.author_olid || null; // Return the author_olid if available otherwise null indicates failure

    } catch (error) {
        console.error(`Error writing author ${author_olid} to database:`, error);
        throw new Error(`Database error storing author ${author_olid}: ${error.message}`);
    }
}

export async function putOlEdition(edition_olid, work_olid, title, description = null, publish_date, cover_url) {
    try {
        let query = `
     INSERT INTO book_editions (edition_olid, work_olid, title, description, publish_date, cover_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING edition_olid;             
    `
        let data = [edition_olid, work_olid, title, description, publish_date, cover_url]

        const Result = await database.query(query, data);

        return Result.rows[0]?.edition_olid || null; // Return the edition_olid if available otherwise null indicates failure

    } catch (error) {
        console.error(`Error writing edition ${edition_olid} to database:`, error);
        throw new Error(`Database error storing edition ${edition_olid}: ${error.message}`);
    }
}

export async function putOlSubject(name, type) {
    try {
        let query = `
     INSERT INTO subjects (name, type)
     VALUES ($1, $2)
     RETURNING id;             
    `
        let data = [name, type]

        const Result = await database.query(query, data);

        return Result.rows[0]?.id || null; // Return the id if available otherwise null indicates failure

    } catch (error) {
        // Handle unique constraint violation specifically if needed
        if (error.code === '23505') { // PostgreSQL unique violation error code
            console.warn(`Subject '${name}' already exists in database. Fetching existing ID.`);
            const existingSubject = await database.query('SELECT id FROM subjects WHERE name = $1', [name]);
            return existingSubject.rows[0]?.id || null;
        }
        console.error(`Error writing subject ${name} to database:`, error);
        throw new Error(`Database error storing subject ${name}: ${error.message}`);
    }
}

export async function putOlWorkSubject(work_olid, subject_id) {
    try {
        let query = `
     INSERT INTO works_subjects (work_olid, subject_id)
     VALUES ($1, $2)
     RETURNING id;             
    `
        let data = [work_olid, subject_id]

        const Result = await database.query(query, data);

        return Result.rows[0]?.id || null; // Return the id if available otherwise null indicates failure

    } catch (error) {
        if (error.code === '23505') { // PostgreSQL unique violation error code
            console.warn(`Work-subject association ${work_olid}:${subject_id} already exists.`);
            return true; // Indicate it's "successful" because it already exists
        }
        console.error(`Error writing work:subject ${work_olid}:${subject_id} to database:`, error);
        throw new Error(`Database error storing work-subject association ${work_olid}:${subject_id}: ${error.message}`);
    }
}

export async function putOlAuthorBook(author_olid, edition_olid) {
    try {
        let query = `
     INSERT INTO authors_books (author_olid, edition_olid)
     VALUES ($1, $2)
     RETURNING id;             
    `
        let data = [author_olid, edition_olid]

        const Result = await database.query(query, data);

        return Result.rows[0]?.id || null; // Return the id if available otherwise null indicates failure

    } catch (error) {
        // If it's a unique constraint violation (author already linked to this book)
        if (error.code === '23505') { // PostgreSQL unique violation error code
            console.warn(`Author-edition association ${author_olid}:${edition_olid} already exists.`);
            return true; // Indicate it's "successful" because it already exists
        }
        console.error(`Error writing author:edition ${author_olid}:${edition_olid} to database:`, error);
        throw new Error(`Database error storing author-edition association ${author_olid}:${edition_olid}: ${error.message}`);

    }
}

export async function putOlLanguage(language, key) {
    try {
        let query = `
     INSERT INTO languages (language, key)
     VALUES ($1, $2)
     RETURNING id;             
    `
        let data = [language, key]

        const Result = await database.query(query, data);

        return Result.rows[0]?.id || null; // Return the id if available otherwise null indicates failure

    } catch (error) {
        // If it's a unique constraint violation (author already linked to this book)
        if (error.code === '23505') { // PostgreSQL unique violation error code
            console.warn(`language ${language} already exists.`);
            return true; // Indicate it's "successful" because it already exists
        }
        console.error(`Error writing language ${language} to database:`, error);
        throw new Error(`Database error storing language ${language}: ${error.message}`);

    }
}

export async function putOlEdition_Language(edition_olid, language_id) {
    try {
        let query = `
     INSERT INTO editions_languages (edition_olid, language_id)
     VALUES ($1, $2)
     RETURNING *;             
    `
        let data = [edition_olid, language_id]

        const Result = await database.query(query, data);

        return Result.rows[0] || null; // Return the id if available otherwise null indicates failure

    } catch (error) {
        // If it's a unique constraint violation (edition already linked to this language)
        if (error.code === '23505') { // PostgreSQL unique violation error code
            console.warn(`Edition-language association ${edition_olid}:${language_id} already exists.`);
            return true; // Indicate it's "successful" because it already exists
        }
        console.error(`Error writing edition-language ${edition_olid}:${language_id} to database:`, error);
        throw new Error(`Database error storing edition-language association ${edition_olid}:${language_id}: ${error.message}`);

    }
}

export async function putUserEdition(user_id, edition_olid, status_id = 1) {
    try {
        let query = `
     INSERT INTO users_books (user_id, edition_olid, status_id)
     VALUES ($1, $2, $3)
     RETURNING id;             
    `
        let data = [user_id, edition_olid, status_id]

        const Result = await database.query(query, data);

        return Result.rows[0]?.id || null; // Return the id if available otherwise null indicates failure

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

export async function updateLanguages() {
    try {
        console.log("Starting language cache update...");
        const olLanguages = await ol.getData('languages');
        const dbLanguages = await getLanguages();

        const dbLanguageKeys = new Set(dbLanguages.map(lang => lang.key));

        const languagesToInsertPromises = [];

        olLanguages.forEach(olLang => {
            // Defensive check: ensure olLang and olLang.key exist and are strings
            if (olLang && typeof olLang.key === 'string' && typeof olLang.language === 'string') {
                if (!dbLanguageKeys.has(olLang.key)) {
                    // If the language key is not in our database, add a promise to insert it
                    languagesToInsertPromises.push(putOlLanguage(olLang.language, olLang.key));
                }
            } else {
                console.warn('Skipping malformed Open Library language object during update:', olLang);
            }
        });
        if (languagesToInsertPromises.length > 0) {
            console.log(`Found ${languagesToInsertPromises.length} new languages to insert into the database.`);

            // Use Promise.allSettled to execute all inserts concurrently.
            // This allows independent inserts to proceed even if some fail,
            // and it provides detailed results for each operation.
            const results = await Promise.allSettled(languagesToInsertPromises);

            let insertedCount = 0;
            let failedCount = 0;

            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    insertedCount++;
                    // Optional: Log successful inserts if needed
                    // console.log(`Successfully inserted language (ID: ${result.value})`);
                } else {
                    failedCount++;
                    // Log errors for failed inserts.
                    // The original olLang isn't directly available here, so we log the reason.
                    console.error(`Failed to insert a language. Reason: ${result.reason}`);
                }
            });
            console.log(`Finished attempting to update languages in the database. Inserted: ${insertedCount}, Failed: ${failedCount}.`);
        } else {
            console.log("All Open Library languages already exist in the database. No new languages to insert.");
        }

    } catch (error) {
        console.error('Error during language cache update in updateLanguages:', error);
        // Re-throw the error to ensure initDbAndCache (the caller) is aware of the failure
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

export async function initDbAndCache() {
    try {
        const [statuses, subjects, olids, languages] = await Promise.all([
            getStatuses(),
            getSubjects(),
            getOlids(),
            // For operations that depend on each other, chain them within the Promise.all
            (async () => {
                await updateLanguages();
                return getLanguages();
            })()
        ]);
        cachedStatuses = statuses;
        cachedSubjects = subjects;
        cachedOlids = olids;
        cachedLanguages = languages;

        //TEST AREA
        //  console.log(await getEditionLanguages('OL51694024M'));
    } catch (error) {
        console.error('Failed to initialize database caches:', error);
        throw error; // Re-throw to propagate the error and prevent server start
    }
}