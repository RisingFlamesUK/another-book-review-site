// This file is /utils/backend-data-handler.js
import * as ol from './ol-handler.js'; // For Open Library API interactions
import * as utils from './utils.js'; // For generic utility functions like validateOlid
import * as db from './db-handler.js'; // For database interactions and cached data
import * as file from './file-handler.js'; // For file system interactions like getting images

/**
 * @typedef {Object} WorksSubjectsAssociation
 * @property {string} work_olid - The Open Library ID of the work.
 * @property {number} subject_id - The internal database ID of the subject.
 */
/**
 * @typedef {Object} AuthorBookAssociation
 * @property {string} author_olid - The Open Library ID of the author.
 * @property {string} edition_olid - The Open Library ID of the edition.
 */
/**
 * @typedef {Object} EditionLanguageAssociation
 * @property {string} edition_olid - The Open Library ID of the edition.
 * @property {number} language_id - The internal database ID of the language.
 */
/**
 * @typedef {Object} DownloadDataResult
 * @property {boolean} success - Indicates if the data synchronization was successful.
 * @property {string} message - A descriptive message about the synchronization outcome.
 * @property {Object | null} editionDetails - The fetched Open Library edition details, or null if not processed.
 * @property {Object | null} workDetails - The fetched Open Library work details, or null if not processed.
 * @property {Array<Object>} authorDetails - An array of fetched Open Library author details.
 */
/**
 * Downloads and synchronizes Open Library data (Editions, Works, Authors, Subjects, Languages, and their associations)
 * into the database. Existing entities will be refreshed, and missing dependent data will be populated.
 *
 * @param {string | null} edition_olid - The Open Library ID of an edition to download/refresh.
 * @param {string | null} work_olid - The Open Library ID of a work to download/refresh.
 * @param {string[]} authors - An array of Open Library author IDs to download/refresh.
 * @param {boolean} [force=false] - If true, forces the update of related work data regardless of its cached state.
 * @returns {Promise<Object>} A promise that resolves when the data synchronization is complete,
 * including the processed edition, work, and author details.
 * @throws {Error} Throws an error if required parameters are missing or invalid, or if a database/Open Library operation fails.
 */
export async function downloadData(edition_olid = null, work_olid = null, authors = [], force = false) {
    console.log(`> downloadData: edition_olid: ${edition_olid || null}, work_olid: ${work_olid || null}, authors: ${authors || []}, force: ${force}....`);
    if (!edition_olid && !work_olid && authors.length === 0) {
        throw new Error('- At least one OLID (edition, work, or author) is required to start.');
    }

    // --- 1. Initial Input Validation & Flags ---
    let processEdition = false;
    let processWork = false;
    let processAuthors = false;

    // Validate edition_olid
    if (edition_olid) {
        if (utils.validateOlid(edition_olid) === 'edition') {
            processEdition = true;
        } else {
            throw new Error(`- Edition OLID (${edition_olid}) is in the wrong format.`);
        }
    }

    // Validate work_olid
    if (work_olid) {
        if (utils.validateOlid(work_olid) === 'work') {
            processWork = true;
        } else {
            throw new Error(`- Work OLID (${work_olid}) is in the wrong format.`);
        }
    }

    // Validate authors array
    if (authors && authors.length > 0) {
        if (!Array.isArray(authors)) {
            throw new Error(`- Expected an array of author OLIDs, but received an invalid type for 'authors'.`);
        }
        for (const author_olid_val of authors) {
            if (utils.validateOlid(author_olid_val) !== 'author') {
                throw new Error(`- Author OLID (${author_olid_val}) is in the wrong format.`);
            }
        }
        processAuthors = true;
    }

    try {
        // --- 2. Data Fetching & Consolidation from Open Library ---
        let olEditionDetails = null; // Full object from OL for edition_olid parameter
        let olWorkDetails = null; // Full object from OL for work_olid parameter
        let olEditionRelatedWorkDetails = null; // Full object from OL for edition's work_olid
        const allAuthorOlidsToFetch = new Set(); // Collect all unique author OLIDs from all sources
        const allSubjectNamesToProcess = new Set(); // Collect all unique subject names
        const allLanguageNamesToProcess = new Set(); // Collect all unique language names (e.g., "English")

        // a. Fetch Edition Data (if requested)
        if (processEdition) {
            console.log(`    Gathering edition data from Open Library for ${edition_olid}`);
            // Always fetch the latest edition details if `edition_olid` is provided
            olEditionDetails = await ol.getOlData("edition", edition_olid);

            if (!olEditionDetails || olEditionDetails.error || !olEditionDetails.edition_olid || utils.validateOlid(olEditionDetails.edition_olid) !== 'edition') {
                throw new Error(`- Failed to retrieve edition data for ${edition_olid} from Open Library.`);
            }

            // Overwrite olEditionDetails.cover_url with the local path
            olEditionDetails.cover_url = await file.getOlImage("edition", olEditionDetails.cover_url);

            // Collect authors from this edition
            (olEditionDetails.authors || []).forEach(author_olid => allAuthorOlidsToFetch.add(author_olid));
            // Collect work_olid for potential related work fetching
            if (olEditionDetails.work_olid) {
                console.log(`> Checking cache for edition ${edition_olid} related work_olid ${olEditionDetails.work_olid}...`);
                const isEditionWorkCached = db.checkCache("work_olid", olEditionDetails.work_olid);
                console.log(`    ...Result: Is ${olEditionDetails.work_olid} cached: ${isEditionWorkCached}`);
                const descriptionEmpty = (olEditionDetails.description || '').length === 0;
                const authorsEmpty = (olEditionDetails.authors || []).length === 0;

                // IMPORTANT: The `force` option applies here to ensure the related work is fetched
                // regardless of its cached status.
                if (olEditionDetails.work_olid !== work_olid && (force || !isEditionWorkCached || descriptionEmpty || authorsEmpty)) {
                    console.log(`    Fetching related work data for edition ${edition_olid}'s work ${olEditionDetails.work_olid} (due to force, not cached, or incomplete edition data).`);
                    olEditionRelatedWorkDetails = await ol.getOlData("works", olEditionDetails.work_olid);
                    if (!olEditionRelatedWorkDetails || olEditionRelatedWorkDetails.error || !olEditionRelatedWorkDetails.work_olid || utils.validateOlid(olEditionRelatedWorkDetails.work_olid) !== 'work') {
                        console.warn(`    - downloadData: Could not retrieve related work data for edition ${edition_olid}'s work ${olEditionDetails.work_olid}`);
                        console.warn(olEditionRelatedWorkDetails);
                        olEditionRelatedWorkDetails = null; // Ensure it's null if fetching failed
                    } else {
                        // Merge authors/description if needed from work data
                        if (authorsEmpty) {
                            (olEditionRelatedWorkDetails.authors || []).forEach(author_olid => allAuthorOlidsToFetch.add(author_olid));
                            olEditionDetails.authors = olEditionRelatedWorkDetails.authors; // Prefer work authors if edition's were empty
                        }
                        if (descriptionEmpty) {
                            olEditionDetails.description = olEditionRelatedWorkDetails.description; // Prefer work description if edition's was empty
                        }
                        // Also collect subjects from this related work
                        (olEditionRelatedWorkDetails.subjects || []).forEach(subjectName => allSubjectNamesToProcess.add(subjectName));
                    }
                }
            }
            // Collect languages from edition (these are names like "English")
            (olEditionDetails.languages || []).forEach(langName => allLanguageNamesToProcess.add(langName));
        }

        // b. Fetch Work Data (if requested as primary work_olid)
        if (processWork) {
            // Always fetch the latest work details if `work_olid` is provided
            olWorkDetails = await ol.getOlData("works", work_olid);
            if (!olWorkDetails || olWorkDetails.error) {
                throw new Error(`- downloadData: Failed to retrieve work data for ${work_olid} from Open Library.`);
            }
            // Collect authors and subjects from this work
            (olWorkDetails.authors || []).forEach(author_olid => allAuthorOlidsToFetch.add(author_olid));
            (olWorkDetails.subjects || []).forEach(subjectName => allSubjectNamesToProcess.add(subjectName));
        }

        // c. Collect authors from the input 'authors' array
        if (processAuthors) {
            authors.forEach(author_olid_val => allAuthorOlidsToFetch.add(author_olid_val));
        }

        // d. Fetch details for all unique collected authors in parallel
        const authorFetchPromises = Array.from(allAuthorOlidsToFetch).map(async (author_olid) => {
            // Always fetch the latest author details if `force` is true or if not cached
            const isAuthorCached = db.checkCache("author_olid", author_olid);
            if (force || !isAuthorCached) {
                const authorDetail = await ol.getOlData("author", author_olid);
                if (!authorDetail || authorDetail.error) {
                    console.warn(`    - downloadData: Failed to retrieve details for author ${author_olid}. Skipping this author.`);
                    return null; // Return null if fetch failed for this author
                }
                // Overwrite authorDetail.pic_url with the local path
                authorDetail.pic_url = await file.getOlImage("author", authorDetail.pic_url);
                return authorDetail;
            } else {
                console.log(`    Author ${author_olid} is cached and not forcing refresh. Skipping remote fetch.`);
                // Return a placeholder that will be skipped or just the cached version if needed later
                return {
                    author_olid: author_olid,
                    cached: true
                }; // Or retrieve from cache if db.getOlData is available
            }
        });
        // Filter out nulls AND cached placeholders that don't need to be processed further
        const fetchedAuthorDetails = (await Promise.all(authorFetchPromises)).filter(detail => detail && !detail.cached);

        // --- 3. Prepare Data for Database Operations (Categorize for post/put/associations) ---
        const subjectsToInsert = []; // Data for postOlSubjects
        const authorsToInsert = []; // Data for postOlAuthors
        const authorsToUpdate = []; // Data for putOlAuthors
        // const worksToInsert = []; // Data for postOlWork
        // const worksToUpdate = []; // Data for putOlWork
        const editionsToInsert = []; // Data for postOlEdition
        const editionsToUpdate = []; // Data for putOlEdition

        const worksSubjectsAssociations = []; // Data for putOlWorksSubjects
        const authorsBooksAssociations = []; // Data for putOlAuthorsBooks
        const editionsLanguagesAssociations = []; // Data for putOlEditionsLanguages

        // Process Subjects:
        for (const subjectName of allSubjectNamesToProcess) {
            // Subjects are handled based on cache regardless of force, as they are simple inserts if missing.
            if (!Array.from(db.cachedSubjects.keys()).some(key => key.startsWith(`${subjectName}|`))) {
                subjectsToInsert.push({
                    name: subjectName,
                    type: null
                }); // Add with type: null if not found
            }
        }

        // Process Authors:
        for (const authorDetail of fetchedAuthorDetails) {
            // If force is true, or if not cached, insert; otherwise, update
            if (force || !db.checkCache("author_olid", authorDetail.author_olid)) {
                authorsToInsert.push(authorDetail); // Push to insert, putOlAuthors will handle upsert if already existing in DB
            } else {
                // If not forcing and cached, then it's an update.
                authorsToUpdate.push(authorDetail);
            }
        }

        // Process Works: 
        const worksToProcessMap = new Map(); // Key: work_olid, Value: workDetail

        if (processWork && olWorkDetails) {
            worksToProcessMap.set(olWorkDetails.olid, olWorkDetails);
        }

        if (olEditionRelatedWorkDetails) {
            worksToProcessMap.set(olEditionRelatedWorkDetails.work_olid, olEditionRelatedWorkDetails);
        }

        // Now, iterate through the consolidated map to correctly populate insert/update arrays
        const worksToInsert = [];
        const worksToUpdate = [];

        for (const [workOlid, workDetail] of worksToProcessMap.entries()) {
            // Determine if this work exists in the cache (and thus, in the database)
            const isWorkCached = db.checkCache("work_olid", workOlid);

            if (isWorkCached) {
                // If the work is cached (i.e., exists in DB)
                // If 'force' is true, or if there's any reason to update (e.g., data changed),
                // it should go into the update list.
                // For simplicity with 'force', if it's cached, we assume it needs an update.
                worksToUpdate.push(workDetail);
            } else {
                // If the work is NOT cached (i.e., new to the DB)
                worksToInsert.push(workDetail);
            }
        }

        // Process Editions: (This also needs the same logic as works now)
        if (processEdition && olEditionDetails) {
            const isEditionCached = db.checkCache("edition_olid", olEditionDetails.edition_olid);
            if (isEditionCached) {
                editionsToUpdate.push(olEditionDetails);
            } else {
                editionsToInsert.push(olEditionDetails);
            }
        }

        // --- 4. Execute Database Operations ---
        console.log("downloadData: Starting database synchronization phases...");

        // Phase 1: Insert/Update Subjects, Works, and Authors (can run in parallel)
        const phase1Promises = [];
        if (subjectsToInsert.length > 0) {
            phase1Promises.push(db.postOlSubjects(subjectsToInsert));
            console.log(`downloadData: Queued ${subjectsToInsert.length} new subjects for insertion.`);
        }
        // Use `worksToInsert` and `worksToUpdate` which were re-populated above to ensure correctness with `force`
        worksToInsert.forEach(work => phase1Promises.push(db.postOlWork(work.work_olid, work.title, work.first_publication_date)));
        if (worksToInsert.length > 0) console.log(`downloadData: Queued ${worksToInsert.length} new works for insertion.`);
        worksToUpdate.forEach(work => phase1Promises.push(db.putOlWork(work.work_olid, work.title, work.first_publication_date)));
        if (worksToUpdate.length > 0) console.log(`downloadData: Queued ${worksToUpdate.length} works for update.`);

        // Use `authorsToInsert` and `authorsToUpdate` which were re-populated above to ensure correctness with `force`
        if (authorsToInsert.length > 0) {
            // Assuming db.postOlAuthors accepts an array of author objects, each having pic_url as local path
            phase1Promises.push(db.postOlAuthors(authorsToInsert));
            console.log(`downloadData: Queued ${authorsToInsert.length} new authors for insertion.`);
        }
        if (authorsToUpdate.length > 0) {
            // Assuming db.putOlAuthors accepts an array of author objects, each having pic_url as local path
            phase1Promises.push(db.putOlAuthors(authorsToUpdate));
            console.log(`downloadData: Queued ${authorsToUpdate.length} authors for update.`);
        }

        if (phase1Promises.length > 0) {
            await Promise.all(phase1Promises);
            console.log("downloadData: Phase 1 (Subjects, Works, and Authors) complete.");
        } else {
            console.log("downloadData: No new subjects, works or authors to insert/update (Phase 1 skipped).");
        }

        // Phase 2: Insert/Update Editions (depends on Works)
        const phase2Promises = [];
        // Use `editionsToInsert` and `editionsToUpdate` which were re-populated above to ensure correctness with `force`
        editionsToInsert.forEach(edition => {
            const {
                edition_olid,
                work_olid,
                title,
                description,
                publish_date,
                cover_url
            } = edition;
            phase2Promises.push(db.postOlEdition(edition_olid, work_olid, title, description, publish_date, cover_url));
        });
        if (editionsToInsert.length > 0) {
            console.log(`downloadData: Queued ${editionsToInsert.length} new editions for insertion.`);
        }

        editionsToUpdate.forEach(edition => {
            const {
                edition_olid,
                work_olid,
                title,
                description,
                publish_date,
                cover_url
            } = edition;
            phase2Promises.push(db.putOlEdition(edition_olid, work_olid, title, description, publish_date, cover_url));
        });
        if (editionsToUpdate.length > 0) {
            console.log(`downloadData: Queued ${editionsToUpdate.length} editions for update.`);
        }

        if (phase2Promises.length > 0) {
            await Promise.all(phase2Promises);
            console.log("downloadData: Phase 2 (Editions) complete.");
        } else {
            console.log("downloadData: No editions to insert/update (Phase 2 skipped).");
        }

        // Phase 3: Synchronize Associations (depends on all entities being in place)
        const phase3Promises = [];
        // --- Collect subjects for associations from primary work (if available) ---
        if (olWorkDetails) {
            for (const subjectName of (olWorkDetails.subjects || [])) {
                let subjectId = null;
                for (const [key, subjectObj] of db.cachedSubjects.entries()) {
                    if (subjectObj.name === subjectName) {
                        subjectId = subjectObj.id;
                        break;
                    }
                }
                if (subjectId) {
                    worksSubjectsAssociations.push({
                        work_olid: olWorkDetails.olid,
                        subject_id: subjectId
                    });
                } else {
                    console.warn(`    - downloadData: Subject '${subjectName}' for primary work ${olWorkDetails.olid} not found in cache after subject insertion. This shouldn't happen.`);
                }
            }
        }

        // --- Collect subjects for associations from related work (if available) ---
        if (olEditionRelatedWorkDetails) {
            for (const subjectName of (olEditionRelatedWorkDetails.subjects || [])) {
                let subjectId = null;
                for (const [key, subjectObj] of db.cachedSubjects.entries()) {
                    if (subjectObj.name === subjectName) {
                        subjectId = subjectObj.id;
                        break;
                    }
                }
                if (subjectId) {
                    worksSubjectsAssociations.push({
                        work_olid: olEditionRelatedWorkDetails.work_olid,
                        subject_id: subjectId
                    });
                } else {
                    console.warn(`    - downloadData: Subject '${subjectName}' for related work ${olEditionRelatedWorkDetails.work_olid} not found in cache after subject insertion. This shouldn't happen.`);
                }
            }
        }

        // Ensure worksSubjectsAssociations has unique pairs (your existing logic)
        const uniqueWorksSubjects = new Set(worksSubjectsAssociations.map(a => `${a.work_olid}|${a.subject_id}`));
        worksSubjectsAssociations.length = 0; // Clear the array before repopulating with unique values
        uniqueWorksSubjects.forEach(pair => {
            const [work_olid, subject_id] = pair.split('|');
            worksSubjectsAssociations.push({
                work_olid,
                subject_id: parseInt(subject_id, 10)
            });
        });


        // --- Collect Edition-Language Associations (if edition details are available) ---
        if (olEditionDetails) {
            for (const langName of (olEditionDetails.languages || [])) {
                let languageId = null;
                for (const langObj of db.cachedLanguages.values()) {
                    if (langObj.language === langName) {
                        languageId = langObj.id;
                        break;
                    }
                }
                if (languageId) {
                    editionsLanguagesAssociations.push({
                        edition_olid: olEditionDetails.edition_olid,
                        language_id: languageId
                    });
                } else {
                    console.warn(`    - downloadData: Language '${langName}' for edition ${olEditionDetails.edition_olid} not found in cache after language insertion. This shouldn't happen.`);
                }
            }
        }

        // --- Collect Author-Book Associations (if edition details are available) ---
        if (olEditionDetails) {
            for (const author_olid of (olEditionDetails.authors || [])) {
                authorsBooksAssociations.push({
                    author_olid: author_olid,
                    edition_olid: olEditionDetails.edition_olid
                });
            }
        }

        // Ensure authorsBooksAssociations has unique pairs (your existing logic)
        const uniqueAuthorsBooks = new Set(authorsBooksAssociations.map(a => `${a.author_olid}|${a.edition_olid}`));
        authorsBooksAssociations.length = 0; // Clear the array
        uniqueAuthorsBooks.forEach(pair => {
            const [author_olid, edition_olid] = pair.split('|');
            authorsBooksAssociations.push({
                author_olid,
                edition_olid
            });
        });

        // Ensure editionsLanguagesAssociations has unique pairs (your existing logic)
        const uniqueEditionsLanguages = new Set(editionsLanguagesAssociations.map(a => `${a.edition_olid}|${a.language_id}`));
        editionsLanguagesAssociations.length = 0; // Clear the array
        uniqueEditionsLanguages.forEach(pair => {
            const [edition_olid, language_id] = pair.split('|');
            editionsLanguagesAssociations.push({
                edition_olid,
                language_id: parseInt(language_id, 10)
            });
        });


        // The pushing of promises to phase3Promises and await Promise.all(phase3Promises)
        // should then follow, just as you have it.
        if (worksSubjectsAssociations.length > 0) {
            phase3Promises.push(db.putOlWorksSubjects(worksSubjectsAssociations));
            console.log(`downloadData: Queued ${worksSubjectsAssociations.length} work-subject associations for synchronization.`);
        }
        if (authorsBooksAssociations.length > 0) {
            phase3Promises.push(db.putOlAuthorsBooks(authorsBooksAssociations));
            console.log(`downloadData: Queued ${authorsBooksAssociations.length} author-book associations for synchronization.`);
        }
        if (editionsLanguagesAssociations.length > 0) {
            phase3Promises.push(db.putOlEditionsLanguages(editionsLanguagesAssociations));
            console.log(`downloadData: Queued ${editionsLanguagesAssociations.length} edition-language associations for synchronization.`);
        }

        if (phase3Promises.length > 0) {
            await Promise.all(phase3Promises);
            console.log("downloadData: Phase 3 (Associations) complete.");
        } else {
            console.log("downloadData: No associations to synchronize (Phase 3 skipped).");
        }

        console.log("downloadData: Data synchronization complete.");
        db.logCurrentCache()
        return {
            success: true,
            message: "Data synchronized successfully.",
            editionDetails: olEditionDetails,
            workDetails: olWorkDetails,
            authorDetails: fetchedAuthorDetails
        };

    } catch (error) {
        console.error(`downloadData: An error occurred during data synchronization:`, error);
        throw new Error(`Failed to synchronize Open Library data: ${error.message}`);
    }
}


/**
 * @typedef {Object} EditionCardData
 * @property {boolean} isEditionCached - True if edition data was primarily from cache, false otherwise.
 * @property {boolean} isWorkCached - True if work data was primarily from cache, false otherwise.
 * @property {string} edition_olid - The Open Library ID of the edition.
 * @property {string | null} work_olid - The Open Library ID of the associated work, or null if no primary work is found/associated..
 * @property {string[]} languages - An array of language names (e.g., ["English", "French"]).
 * @property {string | null} title - The title of the edition, or null if not available from Open Library..
 * @property {string | null} publish_date - The publication date or null.
 * @property {number | null} myScore - The user's score for this edition, or null.
 * @property {string | null} myReview - The user's review for this edition, or null.
 * @property {number | null} workScore - The average score for the associated work, or null.
 * @property {string | null} description - The description of the edition/work, or null.
 * @property {Array<Object> | null} authors - An array of author objects, or null.
 * @property {boolean} authors[].isAuthorCached - True if author data was primarily from cache, false otherwise.
 * @property {string} authors[].edition_olid - The edition OLID this author is associated with (for context).
 * @property {string} authors[].author_olid - The Open Library ID of the author.
 * @property {string} authors[].name - The author's name.
 * @property {string | null} authors[].bio - The author's biography, or null.
 * @property {string | null} authors[].birth_date - The author's birth date, or null.
 * @property {string | null} authors[].death_date - The author's death date, or null.
 * @property {string | null} authors[].pic_url - The local URL of the author's picture, or null.
 * @property {number | null} status_id - The user's reading status ID for this edition, or null.
 * @property {string | null} cover_url - The local URL of the edition's cover image, or null.
 */

/**
 * @async Gets all data needed to populate the edition card (or book card).
 *
 * @param {string} edition_olid - The Open Library ID of the edition.
 * @param {'cached' | 'uncached' | 'all'} mode - Determines data source:
 * - 'cached': Only calls the database for data.
 * - 'uncached': Only calls the Open Library API.
 * - 'all': Prioritizes database data and falls back to Open Library API if not cached.
 * Also triggers `downloadData` to cache uncached entities.
 * @param {string | null} user_id - The ID of the user, or null if no user is logged in.
 * @returns {Promise<EditionCardData>} A promise that resolves to the structured edition card data.
 * @throws {Error} Throws an error if required parameters are missing or invalid, or if data retrieval fails.
 */
export async function getEditionCardData(edition_olid, mode, user_id) {
    if (!edition_olid || !mode || (mode !== "cached" && mode !== "uncached" && mode !== "all")) {
        throw new Error('Edition OLID and mode (cached, uncached or all) are required.');
    }

    try {
        let editionData = null;
        let workData = null;
        let authorsDetailsList = []; // Array of structured author objects
        let myScore = null;
        let myReview = null;
        let workScore = null; // Will store avg_score from work, or user's specific workScore
        let workReviewCount = null; // To match getUserBooks format for workScore
        let status_id = null;
        let isEditionCached = false;
        let isWorkCached = false;
        let primaryWorkOlid = null; // To store the work_olid linked to the edition
        let allAuthorsOlidsFromSource = new Set(); // To collect all author OLIDs for potential downloadData call
        let languagesResult = []; // Will hold array of language name strings

        // --- Step 1: Attempt to get data from cache (prioritizing user-specific if available) ---
        if (user_id && (mode === 'cached' || mode === 'all')) {
            console.log(`Attempting to get user's book data for edition ${edition_olid} from Database.`);
            const userBooks = await db.getUserBooks(user_id);
            const userBookForEdition = userBooks ? userBooks.find(book => book.edition_olid === edition_olid) : null;

            if (userBookForEdition) {
                // Assume userBookForEdition.cover_url is already the local path.
                editionData = {
                    edition_olid: userBookForEdition.edition_olid,
                    work_olid: userBookForEdition.work_olid,
                    title: userBookForEdition.title,
                    publish_date: userBookForEdition.publish_date,
                    description: userBookForEdition.description,
                    cover_url: userBookForEdition.cover_url, // This is expected to be the local URL
                    languages: userBookForEdition.languages, // This will be the array of strings from getUserBooks
                    authors: userBookForEdition.authors ? userBookForEdition.authors.map(a => a.author_olid) : [] // Extracting OLIDs if structured authors are returned
                };
                primaryWorkOlid = userBookForEdition.work_olid;
                isEditionCached = true;
                languagesResult = editionData.languages || []; // Assign directly as it's already strings

                // Populate user-specific data directly from userBookForEdition
                myScore = userBookForEdition.userReview ? userBookForEdition.userReview.userscore : null;
                myReview = userBookForEdition.userReview ? userBookForEdition.userReview.userreview : null;
                workScore = userBookForEdition.workScore ? userBookForEdition.workScore.workscore : null; // Use workscore from userBookForEdition
                workReviewCount = userBookForEdition.workScore ? userBookForEdition.workScore.reviewcount : null; // Use reviewcount
                status_id = userBookForEdition.status_id;

                // Check for work data in cache if primaryWorkOlid exists
                if (primaryWorkOlid) {
                    isWorkCached = db.checkCache('work_olid', primaryWorkOlid);
                    if (isWorkCached) {
                        workData = await db.getWork(primaryWorkOlid);
                    }
                }
            }
        }

        // If editionData is still null (meaning not found in user's cached books or no user_id),
        // or if mode is 'cached' and user_id was not provided, or edition wasn't linked to user,
        // try generic cache or fallback to Open Library API.
        if (!editionData && (mode === 'cached' || mode === 'all')) {
            isEditionCached = db.checkCache('edition_olid', edition_olid);
            if (isEditionCached) {
                console.log(`Attempting to get edition data from Database (generic cache): ${edition_olid}`);
                editionData = await db.getEdition(edition_olid);
                // Assume editionData.cover_url from db.getEdition is already the local path.

                if (editionData && editionData.work_olid) {
                    primaryWorkOlid = editionData.work_olid;
                    isWorkCached = db.checkCache('work_olid', primaryWorkOlid);
                    if (isWorkCached) {
                        workData = await db.getWork(primaryWorkOlid);
                    }
                }
                // Fetch languages for this edition from DB as strings
                languagesResult = await db.getEditionLanguages(edition_olid);
            }
        }

        // --- Step 2: Fallback to Open Library API or forced 'uncached' mode ---
        // If mode is 'uncached', or if mode is 'all' and edition was not cached, fetch from OL
        if (mode === 'uncached' || (mode === 'all' && !isEditionCached)) {
            console.log(`Getting edition data from Open Library: ${edition_olid}`);
            const olEditionResponse = await ol.getOlData("edition", edition_olid);
            if (!olEditionResponse || !olEditionResponse.work_olid) {
                throw new Error(`Failed to retrieve valid edition data for OLID: ${edition_olid} from Open Library.`);
            }
            editionData = olEditionResponse;

            // Always download and overwrite cover_url with the local path
            if (editionData.cover_url) {
                editionData.cover_url = await file.getOlImage("edition", editionData.cover_url); // Overwrite with local path
            } else {
                editionData.cover_url = null; // Ensure it's explicitly null if no URL
            }
            isEditionCached = false; // Just fetched from OL

            primaryWorkOlid = editionData.work_olid;

            // Fetch work data from OL
            const olWorkResponse = await ol.getOlData("works", primaryWorkOlid);
            if (!olWorkResponse || olWorkResponse.error) {
                console.warn(`Could not retrieve work data for ${primaryWorkOlid} from Open Library. Proceeding with available edition data.`);
                workData = null; // Ensure it's null if fetching failed
            } else {
                workData = olWorkResponse;
                isWorkCached = false; // Just fetched from OL
            }

            // Collect authors from edition (and work if edition authors are empty) for potential downloadData call
            (editionData.authors || []).forEach(author_olid => allAuthorsOlidsFromSource.add(author_olid));
            if ((editionData.authors || []).length === 0 && workData) {
                (workData.authors || []).forEach(author_olid => allAuthorsOlidsFromSource.add(author_olid));
            }

            // The ol.getOlData("edition") already returns languages as strings
            languagesResult = editionData.languages || [];

            // If mode is 'all', trigger downloadData to cache everything that was just fetched from OL
            if (mode === 'all') {
                console.log(`Mode 'all': Triggering background data synchronization for ${edition_olid} and related data.`);

                await downloadData(edition_olid, primaryWorkOlid, Array.from(allAuthorsOlidsFromSource));

                // After download, re-fetch from DB to ensure 'isCached' flags are correct and latest data is used
                // This re-fetch will benefit from the logic where user-specific cache (if user_id exists) is checked first
                // or fall back to generic edition cache if user's book list isn't the source
                isEditionCached = db.checkCache('edition_olid', edition_olid);
                if (isEditionCached) {
                    editionData = await db.getEdition(edition_olid);
                    primaryWorkOlid = editionData.work_olid; // Reconfirm work_olid from DB
                    isWorkCached = db.checkCache('work_olid', primaryWorkOlid);
                    if (isWorkCached) {
                        workData = await db.getWork(primaryWorkOlid);
                    }
                    // Re-fetch languages from DB after potential caching
                    languagesResult = await db.getEditionLanguages(edition_olid);
                }
            }

        } else if (mode === 'cached' && !isEditionCached) {
            throw new Error(`Edition OLID: ${edition_olid} not found in cache for 'cached' mode.`);
        }

        // --- Step 3: Ensure editionData is populated, prioritize from DB if available after downloadData call ---
        if (!editionData) {
            throw new Error(`Failed to get edition data for OLID: ${edition_olid} after all attempts.`);
        }

        // Final collection of authors from edition and work (if work authors are needed)
        const finalAuthorsOlids = new Set();
        (editionData.authors || []).forEach(author_olid => finalAuthorsOlids.add(author_olid));
        if ((editionData.authors || []).length === 0 && workData) {
            (workData.authors || []).forEach(author_olid => finalAuthorsOlids.add(author_olid));
        }

        // Fetch details for all final unique authors
        const authorPromises = Array.from(finalAuthorsOlids).map(async (author_olid) => {
            const cached = db.checkCache('author_olid', author_olid);
            let authorDetail;
            if (cached) {
                authorDetail = await db.getAuthor(author_olid);
            } else {
                authorDetail = await ol.getOlData("author", author_olid);
                // Always download author image and overwrite pic_url with local path
                if (authorDetail && authorDetail.pic_url) {
                    authorDetail.pic_url = await file.getOlImage("author", authorDetail.pic_url); // Overwrite with local path
                } else if (authorDetail) {
                    authorDetail.pic_url = null; // Ensure it's null if no URL
                }
            }
            if (!authorDetail) {
                console.warn(`Could not retrieve details for author ${author_olid}. Skipping.`);
                return null;
            }
            // Returning only fields expected by getUserBooks authors array
            return {
                author_olid: author_olid,
                name: authorDetail.name || null,
                bio: authorDetail.bio || null,
                birth_date: authorDetail.birth_date || null,
                death_date: authorDetail.death_date || null,
                pic_url: authorDetail.pic_url || null // This is now always the local URL
            };
        });
        authorsDetailsList = (await Promise.all(authorPromises)).filter(Boolean); // Filter out nulls


        // --- Step 4: Get User-specific data if user_id is provided and not already populated from Step 1 ---
        // This block now only runs if editionData was NOT sourced from userBooks in Step 1
        // and user_id is provided, to fetch potentially missing user-specific details.
        if (user_id && (myScore === null || myReview === null || workScore === null || status_id === null)) {
            // Re-fetch user-specific data from db.getUserBooks with specific edition_olid for precision
            const userBooksFiltered = await db.getUserBooks(user_id, edition_olid);
            const userBookForEdition = userBooksFiltered && userBooksFiltered.length > 0 ? userBooksFiltered[0] : null;

            if (userBookForEdition) {
                // Only update if the values are still null (meaning they weren't fetched in Step 1)
                myScore = myScore === null ? (userBookForEdition.userReview ? userBookForEdition.userReview.userscore : null) : myScore;
                myReview = myReview === null ? (userBookForEdition.userReview ? userBookForEdition.userReview.userreview : null) : myReview;
                workScore = workScore === null ? (userBookForEdition.workScore ? userBookForEdition.workScore.workscore : null) : workScore;
                workReviewCount = workReviewCount === null ? (userBookForEdition.workScore ? userBookForEdition.workScore.reviewcount : null) : workReviewCount;
                status_id = status_id === null ? userBookForEdition.status_id : status_id;
            }
        }


        // If workScore or workReviewCount are still null, attempt to get them from the workData if available.
        // This handles cases where editionData came from generic cache or OL API directly, and workScore wasn't populated from userBooks.
        if (primaryWorkOlid && (workScore === null || workReviewCount === null)) {
            let currentWorkScoreData;
            currentWorkScoreData = await db.getWorkScore(primaryWorkOlid);

            if (currentWorkScoreData) {
                workScore = workScore === null ? (currentWorkScoreData.workscore || null) : workScore;
                workReviewCount = workReviewCount === null ? (currentWorkScoreData.reviewcount || null) : workReviewCount;
            }
        }


        // --- Step 5: Construct and return the final object ---
        // We return a single object that matches the structure of an element in the getUserBooks array.
        return {
            isEditionCached: isEditionCached,
            isWorkCached: isWorkCached,
            user_id: user_id || null, // Can be null if no user is provided
            edition_olid: edition_olid,
            work_olid: primaryWorkOlid || null,
            title: editionData.title || null,
            publish_date: editionData.publish_date || null,
            description: editionData.description || (workData ? workData.description : null), // Prioritize edition, then work
            cover_url: editionData.cover_url || null, // This is now always the local URL
            status_id: status_id,
            authors: authorsDetailsList.length > 0 ? authorsDetailsList : null,
            languages: languagesResult, // This will now be an array of strings directly
            userReview: {
                userreview: myReview,
                userscore: myScore
            },
            workScore: {
                workscore: workScore,
                reviewcount: workReviewCount
            },
        };

    } catch (error) {
        console.error(`Error in getEditionCardData for user ${user_id}, edition ${edition_olid}:`, error.message);
        throw error;
    }
}

/**
 * Handles the selection of an edition by a user, attempting to add it to their collection.
 * This involves first checking if the edition is already in the user's collection,
 * then downloading and synchronizing its data from Open Library (if needed),
 * and finally adding the edition to the user's list of books in the database.
 *
 * @async
 * @param {string} user_id - The unique identifier of the user.
 * @param {string} edition_olid - The Open Library ID (OLID) of the edition to be selected and added.
 * @param {boolean} [force=false] - If true, forces a refresh of the edition's data from Open Library,
 * even if it's already in the user's collection or cached.
 * @returns {Promise<string>} A promise that resolves to a string message indicating the outcome:
 * - "Edition {edition_olid} is already in your collection." if the book exists and `force` is false.
 * - "Edition {edition_olid} data refreshed and confirmed in your collection." if the book exists and `force` is true.
 * - "Edition {edition_olid} added to your collection." if the book was successfully added.
 * @throws {Error} Throws an error if:
 * - `user_id` or `edition_olid` are missing.
 * - `downloadData` fails to retrieve or synchronize Open Library data.
 * - Adding the edition to the user's collection in the database fails after successful data download.
 * - Any unexpected database or internal processing error occurs.
 */
export async function selectedEdition(user_id, edition_olid, force = false) {
    if (!user_id || !edition_olid) {
        throw new Error('User ID and Edition OLID are required.');
    }

    // Ensure userbook is not already in the user's collection
    const existingUserBook = await db.checkUserBook(user_id, edition_olid);

    if (existingUserBook && !force) {
        console.log(`Edition ${edition_olid} already exists in user ${user_id}'s collection and force refresh is not requested.`);
        return `Edition ${edition_olid} is already in your collection.`;
    }

    try {
        // Pass the force option directly to downloadData
        // If existingUserBook is true and force is true, downloadData will proceed with refresh
        const downloadedData = await downloadData(edition_olid, null, [], force);

        if (downloadedData && downloadedData.success) {
            let message = '';
            if (existingUserBook) {
                // If it existed and force was true, we indicate a refresh
                message = `Edition ${edition_olid} data refreshed and confirmed in your collection.`;
                console.log(message);
                // No need to postUserEdition again if it already exists and was just refreshed.
                // However, if db.postUserEdition is idempotent (safe to call multiple times),
                // you *could* call it here too for consistency, but it's likely unnecessary.
                // Assuming postUserEdition strictly inserts, we skip it if existingUserBook is true.
            } else {
                // If it didn't exist, add it to the user's collection
                const result = await db.postUserEdition(user_id, edition_olid);
                if (!result) {
                    throw new Error(`Failed to add edition ${edition_olid} to user ${user_id}'s collection after data download.`);
                }
                message = `Edition ${edition_olid} added to your collection.`;
                console.log(message);
            }
            return message;

        } else {
            throw new Error(`Failed to download or synchronize Open Library data for edition ${edition_olid}. Details: ${downloadedData?.message || 'Unknown download error'}`);
        }

    } catch (error) {
        console.error(`Error in selectedEdition for user ${user_id}, edition ${edition_olid}:`, error.message);
        throw error;
    }
}