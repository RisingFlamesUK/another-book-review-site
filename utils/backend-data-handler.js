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
    console.log(`   *-----------------------------------------------------------------------*`);
    console.log(`   *-------------------       downloadData       --------------------------*`);
    console.log(`   > downloadData: edition_olid: ${edition_olid || null}, work_olid: ${work_olid || null}, authors: ${authors || []}, force: ${force}....`);
    if (!edition_olid && !work_olid && authors.length === 0) {
        throw new Error('     - At least one OLID (edition, work, or author) is required to start.');
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
            throw new Error(`     - Edition OLID (${edition_olid}) is in the wrong format.`);
        }
    }

    // Validate work_olid
    if (work_olid) {
        if (utils.validateOlid(work_olid) === 'work') {
            processWork = true;
        } else {
            throw new Error(`     - Work OLID (${work_olid}) is in the wrong format.`);
        }
    }

    // Validate authors array
    if (authors && authors.length > 0) {
        if (!Array.isArray(authors)) {
            throw new Error(`     - Expected an array of author OLIDs, but received an invalid type for 'authors'.`);
        }
        for (const author_olid_val of authors) {
            if (utils.validateOlid(author_olid_val) !== 'author') {
                throw new Error(`     - Author OLID (${author_olid_val}) is in the wrong format.`);
            }
        }
        processAuthors = true;
    }

    // --- Data structures to collect image URLs for batch processing ---
    const editionCoverUrlsToDownload = new Map(); // Key: edition_olid, Value: original_ol_cover_url
    const authorPicUrlsToDownload = new Map(); // Key: author_olid, Value: original_ol_pic_url

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
            console.log(`     Gathering edition data for ${edition_olid}`);
            let fetchEditionFromOl = true; // Flag to determine if we need to fetch from Open Library

            // First, check the database for the edition and its languages
            if (!force) { // If force is true, we always fetch from OL regardless of cache
                const cachedEdition = await db.getEdition(edition_olid); // Get existing edition core data
                const editionLanguagesFromDb = await db.getEditionLanguages(edition_olid); // Get associated languages

                if (cachedEdition && editionLanguagesFromDb && editionLanguagesFromDb.length > 0) {
                    // If cached and has languages, use it as our primary details
                    olEditionDetails = {
                        ...cachedEdition,
                        languages: editionLanguagesFromDb.map(lang => lang.language_name) // Map to names for consistency
                    };
                    fetchEditionFromOl = false; // We have complete language data from cache, no need to fetch from OL
                    console.log(`     Edition ${edition_olid} found in cache with languages. Skipping Open Library fetch.`);

                    const isEditionDescriptionWeak = !olEditionDetails.description || (typeof olEditionDetails.description === 'string' && olEditionDetails.description.trim().length < 60);
                    const authorsEmpty = !Array.isArray(olEditionDetails.authors) || olEditionDetails.authors.length === 0;

                    if ((isEditionDescriptionWeak || authorsEmpty) && olEditionDetails.work_olid) {
                        console.log(`     Cached edition is missing ${isEditionDescriptionWeak ? 'description' : ''}${isEditionDescriptionWeak && authorsEmpty ? ' and ' : ''}${authorsEmpty ? 'authors' : ''}. Fetching work-level data from OL as fallback.`);

                        const workFallback = await ol.getOlData("works", olEditionDetails.work_olid);

                        if (workFallback && !workFallback.error && workFallback.work_olid) {
                            if (authorsEmpty && Array.isArray(workFallback.authors)) {
                                olEditionDetails.authors = workFallback.authors;
                            }

                            const workDesc = (typeof workFallback.description === 'object' && workFallback.description !== null) ?
                                workFallback.description.value :
                                workFallback.description;

                            if (isEditionDescriptionWeak && typeof workDesc === 'string' && workDesc.length >= 60) {
                                olEditionDetails.description = workDesc;
                                console.log(`     Used work-level description for cached edition ${edition_olid} as fallback.`);
                            }
                        }
                    }
                }
            }

            if (fetchEditionFromOl) {
                console.log(`     Edition ${edition_olid} not fully cached with languages or force update requested. Fetching from Open Library.`);
                olEditionDetails = await ol.getOlData("edition", edition_olid);

                if (!olEditionDetails || olEditionDetails.error || !olEditionDetails.edition_olid || utils.validateOlid(olEditionDetails.edition_olid) !== 'edition') {
                    throw new Error(`     - Failed to retrieve edition data for ${edition_olid} from Open Library.`);
                }
            }

            // Continue processing olEditionDetails whether it came from cache or OL
            if (olEditionDetails) {
                // Ensure publish_date is a string or null.
                if (typeof olEditionDetails.publish_date !== 'string') {
                    if (olEditionDetails.publish_date !== undefined) {
                        console.warn(`     Edition ${edition_olid} has invalid publish_date format:`, olEditionDetails.publish_date, `. Converting to null.`);
                    }
                    olEditionDetails.publish_date = null;
                }

                // Ensure publishers is an array of strings or null.
                if (!Array.isArray(olEditionDetails.publishers)) {
                    if (olEditionDetails.publishers !== undefined) {
                        console.warn(`     Edition ${edition_olid} has invalid publishers format:`, olEditionDetails.publishers, `. Converting to null.`);
                    }
                    olEditionDetails.publishers = null;
                } else {
                    const validPublishers = olEditionDetails.publishers.filter(p => typeof p === 'string');
                    olEditionDetails.publishers = validPublishers.length > 0 ? validPublishers.join(', ') : null;
                }

                // Collect edition cover URL
                if (olEditionDetails.cover_url) {
                    editionCoverUrlsToDownload.set(olEditionDetails.edition_olid, olEditionDetails.cover_url);
                }

                // Collect authors from this edition
                (olEditionDetails.authors || []).forEach(author_olid => allAuthorOlidsToFetch.add(author_olid));

                // Try fallback if needed
                if (olEditionDetails.work_olid) {
                    console.log(`     > Checking cache for edition ${edition_olid} related work_olid ${olEditionDetails.work_olid}...`);

                    const isEditionWorkCached = db.checkCache("work_olid", olEditionDetails.work_olid);
                    console.log(`       ...Result: Is ${olEditionDetails.work_olid} cached: ${isEditionWorkCached}`);

                    // Check description content
                    let editionDesc = typeof olEditionDetails.description === 'object' && olEditionDetails.description !== null ?
                        olEditionDetails.description.value :
                        olEditionDetails.description;

                    const isEditionDescriptionWeak = !editionDesc || editionDesc.trim().length < 60;
                    const authorsEmpty = !Array.isArray(olEditionDetails.authors) || olEditionDetails.authors.length === 0;

                    // If authors or description are missing, pull from work (even if work is cached)
                    if (isEditionDescriptionWeak || authorsEmpty) {
                        console.log(`     Edition has ${isEditionDescriptionWeak ? 'weak/missing description' : ''}${isEditionDescriptionWeak && authorsEmpty ? ' and ' : ''}${authorsEmpty ? 'no authors' : ''}. Fetching work ${olEditionDetails.work_olid} for fallback.`);

                        const workData = await ol.getOlData("works", olEditionDetails.work_olid);

                        if (!workData || workData.error || !workData.work_olid) {
                            console.warn(`     - Failed to retrieve work fallback data for ${olEditionDetails.work_olid}`);
                        } else {
                            olEditionRelatedWorkDetails = workData;

                            if (authorsEmpty && Array.isArray(workData.authors)) {
                                olEditionDetails.authors = workData.authors;
                                workData.authors.forEach(author_olid => allAuthorOlidsToFetch.add(author_olid));
                            }

                            const workDesc = typeof workData.description === 'object' && workData.description !== null ?
                                workData.description.value :
                                workData.description;

                            if (isEditionDescriptionWeak && typeof workDesc === 'string' && workDesc.length >= 60) {
                                olEditionDetails.description = workDesc;
                                console.log(`     Used work-level description for edition ${edition_olid} as fallback.`);
                            }

                            // Collect subjects from fallback work
                            (workData.subjects || []).forEach(subjectName => allSubjectNamesToProcess.add(subjectName));
                        }
                    }
                }

                // Collect edition languages
                (olEditionDetails.languages || []).forEach(lang => allLanguageNamesToProcess.add(lang));
            }
        }

        // b. Fetch Work Data (if requested as primary work_olid)
        if (processWork) {
            // Always fetch the latest work details if `work_olid` is provided
            olWorkDetails = await ol.getOlData("works", work_olid);
            if (!olWorkDetails || olWorkDetails.error) {
                throw new Error(`     - Failed to retrieve work data for ${work_olid} from Open Library.`);
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
        // Only fetch authors not in cache, or if force is true.
        const authorFetchPromises = Array.from(allAuthorOlidsToFetch).map(async (author_olid) => {
            const isAuthorCached = db.checkCache("author_olid", author_olid);
            if (force || !isAuthorCached) {
                const authorDetail = await ol.getOlData("author", author_olid);
                if (!authorDetail || authorDetail.error) {
                    console.warn(`      - Failed to retrieve details for author ${author_olid}. Skipping this author.`);
                    return null; // Return null if fetch failed for this author
                }
                // Collect Author Pic URL For Batch Download
                if (authorDetail.pic_url) {
                    authorPicUrlsToDownload.set(authorDetail.author_olid, authorDetail.pic_url);
                }
                return authorDetail;
            } else {
                console.log(`     Author ${author_olid} is cached and not forcing refresh. Skipping remote fetch.`);
                // Return a placeholder that will be filtered out before DB writes,
                // but keep the OLID to ensure allAuthorOlidsToFetch is correctly processed.
                return {
                    author_olid: author_olid,
                    cached: true
                };
            }
        });
        // Filter out nulls from failed fetches; keep cached placeholders for now
        const fetchedAuthorDetails = (await Promise.all(authorFetchPromises)).filter(detail => detail);

        // Get the list of remote image URLs for editions and authors
        const editionCoverRemoteUrls = Array.from(editionCoverUrlsToDownload.values());
        const authorPicRemoteUrls = Array.from(authorPicUrlsToDownload.values());

        // Execute batch downloads in parallel
        const [downloadedEditionCoverResults, downloadedAuthorPicResults] = await Promise.all([
            file.getOlImage("edition", editionCoverRemoteUrls, "M"),
            file.getOlImage("author", authorPicRemoteUrls)
        ]);

        // Convert results to maps for easy lookup by original remote URL
        const editionCoverLocalPathsMap = new Map();
        const authorPicLocalPathsMap = new Map();

        // Handle single result or array of results from getOlImage for edition covers
        const editionCoverResultsArray = Array.isArray(downloadedEditionCoverResults) ? downloadedEditionCoverResults : (downloadedEditionCoverResults ? [downloadedEditionCoverResults] : []);
        editionCoverResultsArray.forEach(result => {
            if ((result.status === 'cached' || result.status === 'downloaded') && result.remoteImageUrl && result.localPath) {
                editionCoverLocalPathsMap.set(result.remoteImageUrl, result.localPath);
            }
        });

        // Handle single result or array of results from getOlImage for author pictures
        const authorPicResultsArray = Array.isArray(downloadedAuthorPicResults) ? downloadedAuthorPicResults : (downloadedAuthorPicResults ? [downloadedAuthorPicResults] : []);
        authorPicResultsArray.forEach(result => {
            if ((result.status === 'cached' || result.status === 'downloaded') && result.remoteImageUrl && result.localPath) {
                authorPicLocalPathsMap.set(result.remoteImageUrl, result.localPath);
            }
        });

        // --- Apply Downloaded Image Paths Back to Details Objects ---
        if (olEditionDetails && olEditionDetails.cover_url) {
            const localPath = editionCoverLocalPathsMap.get(olEditionDetails.cover_url);
            olEditionDetails.cover_url = localPath || undefined; // Set to local path or undefined if not found/downloaded
        }

        // Apply downloaded author picture paths to fetched author details
        for (const authorDetail of fetchedAuthorDetails) {
            // Only process if not a cached placeholder and has a pic_url (which would be remote at this point)
            if (!authorDetail.cached && authorDetail.pic_url && authorDetail.pic_url.startsWith('http')) {
                const localPath = authorPicLocalPathsMap.get(authorDetail.pic_url);
                authorDetail.pic_url = localPath || undefined; // Set to local path or undefined if not found/downloaded
            }
            // For authors that were cached, their pic_url should remain as it was retrieved from OL.
            // If they were already in the DB, their pic_url is assumed to be correct in the DB.
            // The `fetchedAuthorDetails` array passed to `return` and DB operations will naturally
            // exclude `cached: true` entries from the `trulyFetchedAuthorDetails` filter below.
        }

        // Filter out cached authors *before* preparing for DB operations.
        // These authors are already in the DB and don't need re-insertion/update.
        const trulyFetchedAuthorDetails = fetchedAuthorDetails.filter(detail => !detail.cached);


        // --- 3. Prepare Data for Database Operations (Categorize for post/put/associations) ---
        const subjectsToInsert = []; // Data for postOlSubjects
        const authorsToInsert = []; // Data for postOlAuthors
        const authorsToUpdate = []; // Data for putOlAuthors
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

        // Process Authors: (Use trulyFetchedAuthorDetails)
        for (const authorDetail of trulyFetchedAuthorDetails) {
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

        // Add the primary requested work, if any
        if (processWork && olWorkDetails) {
            worksToProcessMap.set(olWorkDetails.work_olid, olWorkDetails); // Use work_olid for key
        }

        // Add the work related to the edition, if any, ensuring the latest data takes precedence
        if (olEditionRelatedWorkDetails) {
            if (!worksToProcessMap.has(olEditionRelatedWorkDetails.work_olid)) {
                worksToProcessMap.set(olEditionRelatedWorkDetails.work_olid, olEditionRelatedWorkDetails);
            }
        }

        const worksToInsert = [];
        const worksToUpdate = [];

        for (const [workOlid, workDetail] of worksToProcessMap.entries()) {
            const isWorkInDBCache = db.checkCache("work_olid", workOlid);

            if (isWorkInDBCache) {
                worksToUpdate.push(workDetail);
            } else {
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
        console.log("     Starting database synchronization phases...");

        // Phase 1: Insert/Update Subjects, Works, and Authors (can run in parallel)
        const phase1Promises = [];
        if (subjectsToInsert.length > 0) {
            phase1Promises.push(db.postOlSubjects(subjectsToInsert));
            console.log(`       Queued ${subjectsToInsert.length} new subjects for insertion.`);
        }
        worksToInsert.forEach(work => phase1Promises.push(db.postOlWork(work.work_olid, work.title, work.first_publication_date)));
        if (worksToInsert.length > 0) console.log(`       Queued ${worksToInsert.length} new works for insertion.`);
        worksToUpdate.forEach(work => phase1Promises.push(db.putOlWork(work.work_olid, work.title, work.first_publication_date)));
        if (worksToUpdate.length > 0) console.log(`       Queued ${worksToUpdate.length} works for update.`);

        if (authorsToInsert.length > 0) {
            // Assuming db.postOlAuthors accepts an array of author objects, each having pic_url as local path
            phase1Promises.push(db.postOlAuthors(authorsToInsert));
            console.log(`        Queued ${authorsToInsert.length} new authors for insertion.`);
        }
        if (authorsToUpdate.length > 0) {
            // Assuming db.putOlAuthors accepts an array of author objects, each having pic_url as local path
            phase1Promises.push(db.putOlAuthors(authorsToUpdate));
            console.log(`        Queued ${authorsToUpdate.length} authors for update.`);
        }

        if (phase1Promises.length > 0) {
            await Promise.all(phase1Promises);
            console.log("        Phase 1 (Subjects, Works, and Authors) complete.");
        } else {
            console.log("          No new subjects, works or authors to insert/update (Phase 1 skipped).");
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
                publishers,
                publish_date,
                isbn,
                cover_url
            } = edition;
            phase2Promises.push(db.postOlEdition(edition_olid, work_olid, title, description, publishers, publish_date, isbn, cover_url));
        });
        if (editionsToInsert.length > 0) {
            console.log(`          Queued ${editionsToInsert.length} new editions for insertion.`);
        }

        editionsToUpdate.forEach(edition => {
            const {
                edition_olid,
                work_olid,
                title,
                description,
                publishers,
                publish_date,
                isbn,
                cover_url
            } = edition;
            phase2Promises.push(db.putOlEdition(edition_olid, work_olid, title, description, publishers, publish_date, isbn, cover_url));
        });
        if (editionsToUpdate.length > 0) {
            console.log(`          Queued ${editionsToUpdate.length} editions for update.`);
        }

        if (phase2Promises.length > 0) {
            await Promise.all(phase2Promises);
            console.log("        Phase 2 (Editions) complete.");
        } else {
            console.log("          No editions to insert/update (Phase 2 skipped).");
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
                        work_olid: olWorkDetails.work_olid,
                        subject_id: subjectId
                    });
                } else {
                    console.warn(`          - Subject '${subjectName}' for primary work ${olWorkDetails.work_olid} not found in cache after subject insertion. This shouldn't happen.`);
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
                    console.warn(`          - Subject '${subjectName}' for related work ${olEditionRelatedWorkDetails.work_olid} not found in cache after subject insertion. This shouldn't happen.`);
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
                const languageId = db.languageNameToIdMap.get(langName); // Efficient direct lookup

                if (languageId !== undefined) { // Check if the language name was found in the map
                    editionsLanguagesAssociations.push({
                        edition_olid: olEditionDetails.edition_olid,
                        language_id: languageId
                    });
                } else {
                    console.warn(`          - Language '${langName}' not found in languageNameToIdMap for edition ${olEditionDetails.edition_olid}. This language might be new or malformed.`);
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
            console.log(`          Queued ${worksSubjectsAssociations.length} work-subject associations for synchronization.`);
        }
        if (authorsBooksAssociations.length > 0) {
            phase3Promises.push(db.putOlAuthorsBooks(authorsBooksAssociations));
            console.log(`          Queued ${authorsBooksAssociations.length} author-book associations for synchronization.`);
        }
        if (editionsLanguagesAssociations.length > 0) {
            phase3Promises.push(db.putOlEditionsLanguages(editionsLanguagesAssociations));
            console.log(`          Queued ${editionsLanguagesAssociations.length} edition-language associations for synchronization.`);
        }

        if (phase3Promises.length > 0) {
            await Promise.all(phase3Promises);
            console.log("        Phase 3 (Associations) complete.");
        } else {
            console.log("          No associations to synchronize (Phase 3 skipped).");
        }

        console.log("      ... Data synchronization complete.");
        console.log(`   *-------------------   End of downloadData    --------------------------*`);
        console.log(`   *-----------------------------------------------------------------------*`);
        return {
            success: true,
            message: "Data synchronized successfully.",
            editionDetails: olEditionDetails,
            workDetails: olWorkDetails,
            authorDetails: trulyFetchedAuthorDetails // Return only genuinely fetched authors
        };

    } catch (error) {
        console.error(`      - An error occurred during data synchronization:`, error);
        throw new Error(`   - Failed to synchronize Open Library data: ${error.message}`);
    }
}


/**
 * @typedef {Object} EditionCardData
 * @property {boolean} isEditionCached - True if edition data was primarily from cache, false otherwise.
 * @property {boolean} isWorkCached - True if work data was primarily from cache, false otherwise.
 * @property {string} edition_olid - The Open Library ID of the edition.
 * @property {string | null} work_olid - The Open Library ID of the associated work, or null if no primary work is found/associated.
 * @property {string[]} languages - An array of language names (e.g., ["English", "French"]).
 * @property {string | null} title - The title of the edition, or null if not available from Open Library.
 * @property {string | null} publish_date - The publication date or null.
 * @property {string[] | null} publishers - The publishers date or null.
 * @property {string | null} description - The description of the edition/work, or null.
 * @property {Array<Object> | null} authors - An array of author objects, or null.
 * @property {boolean} authors[].isAuthorCached - True if author data was primarily from cache, false otherwise.
 * @property {string} authors[].author_olid - The Open Library ID of the author.
 * @property {string} authors[].name - The author's name.
 * @property {string | null} authors[].bio - The author's biography, or null.
 * @property {string | null} authors[].birth_date - The author's birth date, or null.
 * @property {string | null} authors[].death_date - The author's death date, or null.
 * @property {string | null} authors[].pic_url - The local URL of the author's picture, or null.
 * @property {number | null} status_id - The user's reading status ID for this edition, or null.
 * @property {string | null} cover_url - The local URL of the edition's cover image, or null.
 * @property {boolean} isInCollection - True if the edition is in the user's collection.
 * @property {Array<Object>} editionReviews - An array of all review objects for this edition, *without* user_id.
 * @property {string | null} userReviewID - The review_id of the current user's review for this edition, or null.
 * @property {Object} workScore - An object containing the work's total score, average score and review count.
 * @property {number | null} workScore.totalScore - The total score for the associated work, or null.
 * @property {number | null} workScore.reviewCount - The number of reviews for the associated work, or null.
 * @property {number | null} workScore.averageScore - The average score for the associated work, or null.
 */

/**
 * Retrieves comprehensive data for an edition card, including user-specific details if applicable.
 *
 * @param {string} edition_olid - The Open Library ID of the edition.
 * @param {'cached' | 'uncached' | 'all'} mode - Determines how data is sourced: 'cached' only from DB, 'uncached' only from OL API (and then downloaded), 'all' tries DB first then OL.
 * @param {number | null} user_id - Optional user ID for fetching user-specific book data.
 * @returns {Promise<EditionCardData>} - An object containing all data required for an edition card.
 * @throws {Error} If data cannot be retrieved based on the specified mode.
 */
export async function getEditionCardData(edition_olid, mode = 'all', user_id) {
    if (!edition_olid || !mode || (mode !== "cached" && mode !== "uncached" && mode !== "all")) {
        throw new Error('getEditionCardData: Edition OLID and mode (cached, uncached or all) are required.');
    }
    console.log(`> getEditionCardData: retrieving data...`);
    try {
        let editionData = null;
        let workData = null;
        let authorsDetailsList = []; // Array of structured author objects
        let loggedInUserReviewId = null; // New variable to store the user's review ID
        let workScore = null; // Will store avg_score from work, or user's specific workScore
        //        let workReviewCount = null; // To match getUserBooks format for workScore
        let status_id = null;
        let isEditionCached = false;
        let isWorkCached = false;
        let primaryWorkOlid = null; // To store the work_olid linked to the edition
        let languagesResult = []; // Will hold array of language name strings
        let isInCollection = false;

        // --- Step 1: Attempt to get data from cache (prioritizing user-specific if available) ---
        if (user_id && (mode === 'cached' || mode === 'all')) {
            console.log(`   Attempting to get user's book data for edition ${edition_olid} from Database.`);

            const userBooks = await db.getUserBooks(user_id);
            const userBookForEdition = userBooks ? userBooks.find(book => book.edition_olid === edition_olid) : null;

            if (userBookForEdition) {
                editionData = {
                    edition_olid: userBookForEdition.edition_olid,
                    work_olid: userBookForEdition.work_olid,
                    title: userBookForEdition.title,
                    publishers: userBookForEdition.publishers,
                    publish_date: userBookForEdition.publish_date,
                    description: userBookForEdition.description,
                    cover_url: userBookForEdition.cover_url,
                    languages: userBookForEdition.languages,
                    authors: userBookForEdition.authors
                };
                primaryWorkOlid = userBookForEdition.work_olid;
                isEditionCached = true;
                languagesResult = editionData.languages || [];

                // Populate user-specific data (excluding userReviewObject as a direct field)
                //                workScore = userBookForEdition.workScore ? userBookForEdition.workScore.workscore : null;
                //                workReviewCount = userBookForEdition.workScore ? userBookForEdition.workScore.reviewcount : null;
                workScore = userBookForEdition.workScore || null;
                status_id = userBookForEdition.status_id;
                isInCollection = true;

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
                console.log(`   Attempting to get edition data from Database (generic cache): ${edition_olid}`);
                editionData = await db.getEdition(edition_olid);

                // FETCH AUTHORS FOR EDITION FROM DB using getEditionAuthors
                if (editionData) {
                    editionData.authors = await db.getEditionAuthors(edition_olid);
                }

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

        // --- Step 2: Fallback to Open Library API or forced 'uncached' mode & Download ---
        // If mode is 'uncached' or (mode is 'all' and edition was not cached), fetch from OL, then download.
        if (mode === 'uncached' || (mode === 'all' && !isEditionCached)) {
            console.log(`   Fetching raw edition and work data from Open Library for caching: ${edition_olid}`);
            const olEditionResponse = await ol.getOlData("edition", edition_olid);
            if (!olEditionResponse || !olEditionResponse.work_olid) {
                throw new Error(`   - Failed to retrieve valid edition data for OLID: ${edition_olid} from Open Library.`);
            }

            primaryWorkOlid = olEditionResponse.work_olid;
            let olWorkResponse = null;
            try {
                olWorkResponse = await ol.getOlData("works", primaryWorkOlid);
            } catch (error) {
                console.warn(`   - Could not retrieve work data for ${primaryWorkOlid} from Open Library. Proceeding with available edition data. Error: ${error.message}`);
            }

            // Collect all unique author OLIDs from OL responses for downloadData using utils.formatPrefix
            const olAuthorsOlidsToCache = new Set();
            // Use formatPrefix to get clean OLID strings from the potentially nested OL author objects
            const editionAuthorsFromOl = utils.formatPrefix('authors', olEditionResponse.authors || []);
            editionAuthorsFromOl.forEach(olid => olAuthorsOlidsToCache.add(olid));

            if ((olEditionResponse.authors || []).length === 0 && olWorkResponse) {
                const workAuthorsFromOl = utils.formatPrefix('authors', olWorkResponse.authors || []);
                workAuthorsFromOl.forEach(olid => olAuthorsOlidsToCache.add(olid));
            }

            console.log(`   Triggering background data synchronization for ${edition_olid} (and work ${primaryWorkOlid}) using downloadData.`);
            await downloadData(edition_olid, primaryWorkOlid, Array.from(olAuthorsOlidsToCache));

            // After download, re-fetch all data from DB to ensure 'isCached' flags are correct and latest data is used
            isEditionCached = db.checkCache('edition_olid', edition_olid);
            if (isEditionCached) {
                editionData = await db.getEdition(edition_olid);

                if (editionData) {
                    editionData.authors = await db.getEditionAuthors(edition_olid);
                }
                // Ensure primaryWorkOlid is derived from editionData as it's the most reliable link
                primaryWorkOlid = editionData ? editionData.work_olid : null;

                if (primaryWorkOlid) {
                    isWorkCached = db.checkCache('work_olid', primaryWorkOlid);
                    if (isWorkCached) {
                        workData = await db.getWork(primaryWorkOlid);
                    }
                }
                languagesResult = await db.getEditionLanguages(edition_olid);
            } else {
                // This case should theoretically not happen if downloadData succeeded
                throw new Error(`   - Edition OLID: ${edition_olid} not found in cache for 'uncached' or 'all' mode.`);
            }

        } else if (mode === 'cached' && !isEditionCached) {
            throw new Error(`   - Edition OLID: ${edition_olid} not found in cache for 'cached' mode.`);
        }

        // --- Step 3: Ensure editionData is populated, prioritize from DB if available ---
        if (!editionData) {
            throw new Error(`   - Failed to get edition data for OLID: ${edition_olid} after all attempts.`);
        }

        // Initialize authorsDetailsList.
        // We will build this list with full author objects, including local image paths.
        authorsDetailsList = [];

        const uniqueAuthorOlids = new Set();
        // Collect all author OLIDs from editionData
        const editionAuthorsOlids = utils.formatPrefix('authors', editionData.authors || []);
        editionAuthorsOlids.forEach(olid => uniqueAuthorOlids.add(olid));

        // If edition had no authors, but workData exists and has authors, collect those too
        if (editionAuthorsOlids.length === 0 && workData && workData.authors) {
            const workAuthorsOlids = utils.formatPrefix('authors', workData.authors || []);
            workAuthorsOlids.forEach(olid => uniqueAuthorOlids.add(olid));
        }

        const authorOlidsArray = Array.from(uniqueAuthorOlids);

        // First pass: Fetch author details and identify remote image URLs for batch download
        const authorsForBatchImageDownload = []; // Will store objects like { author_olid, remoteImageUrl }
        const authorDetailPromises = authorOlidsArray.map(async (author_olid) => {
            const cached = db.checkCache('author_olid', author_olid);
            let authorDetail = null;
            let isAuthorCached = false; // Flag to indicate if author metadata was cached

            if (cached) {
                const cachedAuthors = await db.getAuthors([author_olid]);
                if (cachedAuthors && cachedAuthors.length > 0) {
                    authorDetail = cachedAuthors[0];
                    isAuthorCached = true; // Mark as cached if from DB
                }
            } else {
                authorDetail = await ol.getOlData("author", author_olid);
            }

            if (!authorDetail) {
                console.warn(`   - Could not retrieve details for author ${author_olid}. Skipping.`);
                return null;
            }

            // If the pic_url from OL (or even from DB if it's still a remote URL somehow)
            // is a remote URL, add it to the list for batch download.
            // Otherwise, if it's already a local path (from DB), we'll use it directly.
            if (authorDetail.pic_url && typeof authorDetail.pic_url === 'string' && authorDetail.pic_url.startsWith('http')) {
                authorsForBatchImageDownload.push({
                    author_olid,
                    remoteImageUrl: authorDetail.pic_url
                });
            }

            return {
                isAuthorCached: isAuthorCached, // Store if the author's metadata was cached
                author_olid: author_olid,
                name: authorDetail.name || null,
                bio: authorDetail.bio || null,
                birth_date: authorDetail.birth_date || null,
                death_date: authorDetail.death_date || null,
                pic_url: authorDetail.pic_url || null // This will be the remote URL or cached local path
            };
        });

        // Resolve all initial author detail promises (fetching metadata from DB or OL)
        const fetchedAuthors = (await Promise.all(authorDetailPromises)).filter(Boolean);

        // Prepare inputs for the single batch image download call
        const imageInputsForBatch = authorsForBatchImageDownload.map(a => a.remoteImageUrl);

        let imageDownloadResults = [];
        if (imageInputsForBatch.length > 0) {
            // Call the batch image download function once with all relevant remote URLs
            const results = await file.getOlImage("author", imageInputsForBatch);
            // Ensure imageDownloadResults is an array, as file.getOlImage could return a single object if only one input
            imageDownloadResults = Array.isArray(results) ? results : (results ? [results] : []);
        }

        // Create a map to easily look up local paths by original remote URL
        const localPathByRemoteUrl = new Map();
        imageDownloadResults.forEach(result => {
            if ((result.status === 'cached' || result.status === 'downloaded') && result.remoteImageUrl && result.localPath) {
                localPathByRemoteUrl.set(result.remoteImageUrl, result.localPath);
            }
        });

        // Second pass: Construct the final authorsDetailsList, updating pic_url with local paths
        authorsDetailsList = fetchedAuthors.map(author => {
            if (author.pic_url && author.pic_url.startsWith('http')) {
                // This author's pic_url was a remote URL, try to find its downloaded local path
                const localPath = localPathByRemoteUrl.get(author.pic_url);
                return {
                    ...author,
                    pic_url: localPath || null // Use local path if found, else null (if download failed/skipped)
                };
            }
            return author; // Use existing pic_url (already local or null, or not an HTTP URL)
        });

        // Fetch and populate the reviews for this edition
        editionData.editionReviews = await db.getEditionReviews(edition_olid);

        // Populate loggedInUserReviewId from the fetched editionReviews if user_id is present
        // This must happen BEFORE stripping user_id from the editionReviews array.
        if (user_id && editionData.editionReviews && editionData.editionReviews.length > 0) {
            const userReviewInList = editionData.editionReviews.find(review => review.user_id === user_id);
            if (userReviewInList) {
                loggedInUserReviewId = userReviewInList.review_id;
            }
        }

        // Strip user_id from each review object in the editionReviews array
        editionData.editionReviews = editionData.editionReviews.map(review => {
            const {
                user_id,
                ...rest
            } = review; // Destructure to exclude user_id
            return rest;
        });

        // --- Step 4: Get User-specific data if user_id is provided and not already fully populated from Step 1 ---
        // This block only runs if editionData was NOT sourced from userBooks in Step 1
        // and user_id is provided, to fetch potentially missing user-specific details.
        // It now checks if relevant user-specific data (workScore, status_id, isInCollection) are still null/false.
        if (user_id && (workScore === null || status_id === null || !isInCollection)) {
            const allUserBooks = await db.getUserBooks(user_id);
            const userBookForEdition = allUserBooks ? allUserBooks.find(book => book.edition_olid === edition_olid) : null;

            if (userBookForEdition) {
                //                workScore = workScore === null ? (userBookForEdition.workScore ? userBookForEdition.workScore.workscore : null) : workScore;
                //                workScore = workScore === null ? (userBookForEdition.workScore ? userBookForEdition.workScore.workscore : null) : workScore;
                //                workReviewCount = workReviewCount === null ? (userBookForEdition.workScore ? userBookForEdition.workScore.reviewcount : null) : workReviewCount;
                status_id = status_id === null ? userBookForEdition.status_id : status_id;
                isInCollection = isInCollection === false ? true : isInCollection;
            }
        }

        // If workScore or workReviewCount are still null, attempt to get them from the workData if available.
        // This handles cases where editionData came from generic cache or OL API directly, and workScore wasn't populated from userBooks.
        /*        if (primaryWorkOlid && (workScore === null || workReviewCount === null)) {
                    const workScoresArray = await db.getWorksScore(primaryWorkOlid);
                    const currentWorkScoreData = workScoresArray.length > 0 ? workScoresArray[0] : null;

                    if (currentWorkScoreData) {
                        workScore = workScore === null ? (currentWorkScoreData.workScore || null) : workScore;
                        workReviewCount = workReviewCount === null ? (currentWorkScoreData.reviewcount || null) : currentWorkScoreData.reviewcount;
                    }
                }  */
        if (primaryWorkOlid && (!workScore || workScore.averageScore == null)) {
            const w = await db.getWorksScore(primaryWorkOlid);
            if (w && w.averageScore != null) workScore = w;
        }

        // Convert languagesResult into just languages:
        const languages = languagesResult.length > 0 ? languagesResult[0].languages : [];

        let editionReviews = editionData.editionReviews;
        editionReviews.sort((a, b) => new Date(b.created) - new Date(a.created));

        if (loggedInUserReviewId) {
            const idx = editionReviews.findIndex(r => r.review_id === loggedInUserReviewId);
            const [myReview] = editionReviews.splice(idx, 1);
            editionReviews.unshift(myReview);
        }
        console.log(`   ... getEditionCardData: complete. Passing data to the card`);
        // --- Step 5: Construct and return the final object ---
        return {
            isEditionCached: isEditionCached,
            isWorkCached: isWorkCached,
            edition_olid: edition_olid,
            work_olid: primaryWorkOlid || null,
            title: editionData.title || null,
            publishers: typeof editionData.publishers === 'string' ?
                editionData.publishers.split(', ').map(p => p.trim()).filter(Boolean) : (Array.isArray(editionData.publishers) ? editionData.publishers.filter(Boolean) : null),
            publish_date: editionData.publish_date || null,
            description: editionData.description || (workData ? workData.description : null),
            cover_url: editionData.cover_url || null,
            status_id: status_id,
            authors: authorsDetailsList.length > 0 ? authorsDetailsList : null,
            languages: languages,
            isbn: editionData.isbn || null,
            editionReviews: editionReviews,
            userReviewID: loggedInUserReviewId,
            workScore: workScore,
            isInCollection: isInCollection,
        };

    } catch (error) {
        console.error(`   - Error in getEditionCardData for user ${user_id}, edition ${edition_olid}:`, error.message);
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

/**
 * Retrieves comprehensive data for a given Open Library Work, including its details,
 * associated editions, authors, and cover images. It also attempts to find the
 * richest description and determines a primary cover.
 * If a user_id is provided, it will also mark which editions are already
 * in the user's collection with an 'isInCollection' flag.
 *
 * @async
 * @param {string} work_olid - The Open Library ID (OLID) of the work.
 * @param {string} [user_id=null] - Optional. The unique identifier of the user to check against their collection.
 * @returns {Promise<object>} A promise that resolves to an object containing:
 * - `workData`: Object with work details (title, description, authors, main cover).
 * - `workEditions`: Array of edition objects, each potentially including a `cover` path and an `isInCollection` boolean.
 * - `totalEditionsCount`: The total number of editions for the work.
 * - `workScore`: Data related to the work's score (if applicable).
 * @throws {Error} Throws an error if `work_olid` is missing or if data retrieval fails.
 */
export async function getWorkCardData(work_olid, user_id = null) {
    if (typeof work_olid !== 'string' || !work_olid.startsWith('OL') || !(work_olid.endsWith('W') || work_olid.endsWith('M') || work_olid.endsWith('A'))) {
        const errorMsg = `Invalid work_olid parameter provided to getWorkCardData. Expected a string in the format "OL" followed by digits and ending with "M", "W", or "A" (e.g., "OL12345W"), but received: '${work_olid}'.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    try {
        const MIN_DESC_LENGTH = 10;
        let workDetails = null;
        let description = null;
        let workEditions = [];
        let totalEditionsCount = 0;
        let primaryWorkCoverId = null;
        let workScore = null; // Initialize workScore

        console.log(`> getWorkCardData: retrieving data...`);
        // 1. Prioritize Cache/Database for initial work data using db.checkCache
        if (db.checkCache('work_olid', work_olid)) {
            console.log(`   Retrieving work ${work_olid} from database cache.`);
            workDetails = await db.getWork(work_olid);
            if (!workDetails) { // Fallback if DB lookup fails for some reason
                console.warn(`   - Work ${work_olid} found in cache, but DB lookup failed. Attempting download from OL.`);
                const downloadedData = await downloadData(null, work_olid, [], false);
                workDetails = downloadedData.workDetails;
            }
        } else {
            console.log(`   Downloading initial work ${work_olid} data from Open Library.`);
            const downloadedData = await downloadData(null, work_olid, [], false);
            workDetails = downloadedData.workDetails;
        }

        if (!workDetails) {
            throw new Error(`   - Failed to retrieve initial work data for work_olid: ${work_olid}`);
        }

        description = workDetails.description; // Start with the description from initial workDetails (if exists)

        // Parallelize fetching of editions, search results, and work score
        console.log(`   Initiating parallel fetches for editions, search data, and work score for work ${work_olid}.`);
        const [
            allWorkEditionsResult,
            searchResult,
            allWorkScores
        ] = await Promise.all([
            getAllWorkEditions(work_olid), // Fetch all editions
            ol.getOlData("work-search", `${work_olid}`, 1, null, 1), // Search API for description, authors, primary cover ID
            db.getWorksScore([work_olid]) // Fetch work score
        ]);

        // Process results from parallel fetches
        workEditions = allWorkEditionsResult.editions;
        totalEditionsCount = allWorkEditionsResult.totalCount;
        console.log(`   + Successfully retrieved ${workEditions.length} editions (total: ${totalEditionsCount}) for work ${work_olid}.`);

        workScore = allWorkScores.find(score => score.work_olid === work_olid) || null;
        console.log(`   + Successfully retrieved work score for work ${work_olid}.`);


        // 2. Process Search API result for description, authors, and primary cover ID
        try {
            if (searchResult && searchResult.docs && searchResult.docs.length > 0) {
                const mainDoc = searchResult.docs[0];

                // Use the description from the search result if it's better or the primary one
                const searchDesc = typeof mainDoc.description === 'object' && mainDoc.description !== null ?
                    mainDoc.description.value :
                    mainDoc.description;

                if (searchDesc && typeof searchDesc === 'string' && searchDesc.length > (typeof description === 'string' ? description.length : 0)) {
                    description = searchDesc;
                    console.log(`   Work OLID ${work_olid}: Using richer description from Open Library Search API.`);
                }

                // If we haven't got our authors yet then populate from this result
                if (!workDetails.authors) {
                    workDetails.authors = mainDoc.author_key || []; // author_key is an array of OLIDs for authors
                }

                // Select the primary work cover ID from search result, fallback to first edition's OLID if available
                primaryWorkCoverId = mainDoc.cover_i || (workEditions.length > 0 ? workEditions[0].edition_olid : null);

            } else {
                console.warn(`   Work OLID ${work_olid}: Search API returned no docs for this OLID. Using getAllWorkEditions for initial cover ID fallback.`);
                primaryWorkCoverId = workEditions.length > 0 ? workEditions[0].olid : null;
            }
        } catch (searchError) {
            console.error(`   - Error using Search API for work ${work_olid}: ${searchError.message}. Using getAllWorkEditions for initial cover ID fallback.`);
            primaryWorkCoverId = workEditions.length > 0 ? workEditions[0].olid : null;
        }


        // Further refinement of description if still insufficient
        if (typeof description !== 'string' || description.length < MIN_DESC_LENGTH) {
            console.log(`   Current description is insufficient for work ${work_olid}. Attempting to retrieve richer description from Work API.`);
            try {
                const workApiResult = await ol.getOlData("works", work_olid);
                const workApiDesc = typeof workApiResult.description === 'object' && workApiResult.description !== null ?
                    workApiResult.description.value :
                    workApiResult.description;

                if (workApiDesc && typeof workApiDesc === 'string' && workApiDesc.length > (typeof description === 'string' ? description.length : 0)) {
                    description = workApiDesc;
                    console.log(`   Work OLID ${work_olid}: Found richer description from Open Library Work API.`);
                }
            } catch (workApiError) {
                console.warn(`   - Failed to retrieve description from Work API for ${work_olid}: ${workApiError.message}.`);
            }
        }

        // 3. Fallback: Retrieve Description from Editions if current description is insufficient
        // This loop now iterates over `workEditions` which was populated by getAllWorkEditions
        if (typeof description !== 'string' || description.length < MIN_DESC_LENGTH) {
            console.log(`   Current description is insufficient for work ${work_olid}. Attempting to retrieve richer description from editions.`);
            for (const edition of workEditions) {
                let editionDetails = null;
                // Assuming edition objects from getAllWorkEditions have an 'olid' property
                if (edition.edition_olid) {
                    try {
                        // Check cache first for edition details

                        if (db.checkCache('edition_olid', edition.edition_olid)) {
                            editionDetails = await db.getEdition(edition.edition_olid);
                            if (!editionDetails) {
                                console.warn(`   Edition ${edition.edition_olid} was in cache, but DB lookup failed. Attempting direct download from Open Library.`);
                                editionDetails = await ol.getOlData("edition", edition.edition_olid);
                            }
                        } else {
                            // Not in cache, download directly
                            editionDetails = await ol.getOlData("edition", edition.edition_olid);
                        }

                        const editionDesc = typeof editionDetails.description === 'object' && editionDetails.description !== null ?
                            editionDetails.description.value :
                            editionDetails.description;

                        // If a better description is found, update and break
                        if (editionDesc && typeof editionDesc === 'string' && editionDesc.length > (typeof description === 'string' ? description.length : 0) && editionDesc.length >= MIN_DESC_LENGTH) {
                            description = editionDesc;
                            console.log(`   Work OLID ${work_olid}: Found richer description from edition ${edition.edition_olid}.`);
                            break; // Stop after finding a sufficient description
                        }
                    } catch (editionDescError) {
                        console.warn(`   - Failed to retrieve description for edition ${edition.edition_olid}: ${editionDescError.message}`);
                    }
                }
            }
        }
        // Apply the chosen description to workDetails
        workDetails.description = description;

        // 4. Resolve Authors: Use downloadData to ensure all authors are synchronized and then retrieve from DB
        const authorOlids = Array.isArray(workDetails.authors) ? workDetails.authors : (workDetails.authors ? [workDetails.authors] : []);

        if (authorOlids.length > 0) {
            console.log(`   Ensuring ${authorOlids.length} authors are synchronized via downloadData.`);
            try {
                // `downloadData` implicitly calls `file.getOlImage` for author images,
                // but that's handled internally by `downloadData` which should also be updated
                // to use the batching capabilities of `file.getOlImage` for author profiles.
                // Assuming `downloadData` is also refactored to use file.getOlImage batching.
                let downloadResult = await downloadData(null, null, authorOlids, false);
                const resolvedAuthors = await db.getAuthors(authorOlids);
                workDetails.authors = resolvedAuthors;
                console.log(`   + Successfully retrieved details for ${downloadResult.authorDetails.length} authors from database.`);
            } catch (authorSyncError) {
                console.error(`   - Error synchronizing and retrieving authors for work ${work_olid}: ${authorSyncError.message}`);
                workDetails.authors = [];
            }
        } else {
            workDetails.authors = [];
        }

        let userCollectedEditionOlids = new Set();
        if (user_id) {
            console.log(`   Checking user ${user_id}'s collection for editions of work ${work_olid}.`);
            // getUserBooks returns an array of detailed book objects,
            // we only need their edition_olid for this check.
            const userBooks = await db.getUserBooks(user_id);
            if (userBooks) { // getUserBooks returns null if no books found for the user
                userCollectedEditionOlids = new Set(userBooks.map(book => book.edition_olid));
            }
        }

        // 6. Process Covers for all gathered editions and the main work cover
        // Collect all edition cover identifiers for 'S' size
        const editionCoverIdentifiers = workEditions.map(edition => {
            // Prioritize edition.coverId, then edition.edition_olid
            let identifier = edition.coverId;
            if (!identifier && edition.edition_olid) {
                identifier = edition.edition_olid;
            }
            return identifier;
        }).filter(id => id !== null && id !== undefined && id !== -1); // Filter out invalid identifiers

        let editionImageResults = [];
        if (editionCoverIdentifiers.length > 0) {
            console.log(`   Fetching ${editionCoverIdentifiers.length} edition covers in batch ('S' size) for work ${work_olid}.`);
            // Call getOlImage once for all edition covers
            editionImageResults = await file.getOlImage('edition', editionCoverIdentifiers, 'S');
        }

        const coverPathMap = new Map();
        editionImageResults.forEach(result => {
            if (result.originalInput && result.localPath) {
                coverPathMap.set(String(result.originalInput), result.localPath);
            }
        });

        // Create a new array to hold editions with their covers AND isInCollection flag
        const editionsWithCachedCovers = workEditions.map((edition) => {
            const coverIdentifier = String(edition.coverId || edition.edition_olid); // Ensure string for map key

            // Get the local path from the map, defaulting to null if not found
            const coverLocalPath = coverPathMap.get(coverIdentifier) || null;

            // Ensure language is an array
            const languageArray = Array.isArray(edition.languages) ? edition.languages : (edition.languages ? [edition.languages] : []);
            return {
                ...edition,
                cover: coverLocalPath, // This will now correctly link the cover path
                languages: languageArray, // Ensure this is named 'languages' (plural) for consistency
                // Add the isInCollection flag
                isInCollection: user_id ? userCollectedEditionOlids.has(edition.edition_olid) : false
            };
        });

        // 7. Determine Main Work Cover
        let mainWorkCoverUrl = null;

        if (primaryWorkCoverId) {
            console.log(`   Fetching primary work cover ${primaryWorkCoverId} ('M' size).`);
            try {
                // Call getOlImage for the single primary work cover
                const mainImageResult = await file.getOlImage('edition', [primaryWorkCoverId], 'M');
                mainWorkCoverUrl = mainImageResult[0]?.localPath || null;
            } catch (coverErr) {
                console.warn(`   - Failed to cache primary work cover ${primaryWorkCoverId}: ${coverErr.message}`);
            }
        }

        // Fallback to latest English edition cover (M size), then latest any-language edition cover (M size)
        if (!mainWorkCoverUrl && editionsWithCachedCovers.length > 0) {
            // Helper to parse date for sorting
            const parseDateForSorting = (dateString) => {
                if (!dateString) return null;
                const yearMatch = dateString.match(/\b(\d{4})\b/);
                if (yearMatch) return new Date(parseInt(yearMatch[1], 10), 0, 1);
                try {
                    const date = new Date(dateString);
                    return isNaN(date.getTime()) ? null : date;
                } catch (e) {
                    return null;
                }
            };

            // a. Filter editions that actually have a coverId or valid olid to use as coverId
            const editionsWithPotentialCovers = editionsWithCachedCovers.filter(e => {
                const identifier = e.coverId || e.olid;
                // Ensure identifier is not null, undefined, or -1
                return identifier !== null && identifier !== undefined && identifier !== -1;
            });

            let bestFallbackEdition = null;

            // b. Try to find the latest English edition with a potential cover
            const englishEditionsWithCovers = editionsWithPotentialCovers.filter(e =>
                e.languages && Array.isArray(e.languages) && e.languages.includes('English')
            );

            if (englishEditionsWithCovers.length > 0) {
                englishEditionsWithCovers.sort((a, b) => {
                    const dateA = parseDateForSorting(a.publish_date);
                    const dateB = parseDateForSorting(b.publish_date);
                    if (!dateA && !dateB) return 0;
                    if (!dateA) return 1;
                    if (!dateB) return -1;
                    return dateB.getTime() - dateA.getTime(); // Newest first
                });
                bestFallbackEdition = englishEditionsWithCovers[0];
            }

            // c. If no English edition with a cover, find the latest edition of any language with a potential cover
            if (!bestFallbackEdition && editionsWithPotentialCovers.length > 0) {
                editionsWithPotentialCovers.sort((a, b) => { // This array is already filtered for potential covers
                    const dateA = parseDateForSorting(a.publish_date);
                    const dateB = parseDateForSorting(b.publish_date);
                    if (!dateA && !dateB) return 0;
                    if (!dateA) return 1;
                    if (!dateB) return -1;
                    return dateB.getTime() - dateA.getTime(); // Newest first
                });
                bestFallbackEdition = editionsWithPotentialCovers[0];
            }

            // d. If a best fallback edition is found, try to fetch its 'M' size cover
            if (bestFallbackEdition) {
                const fallbackCoverId = bestFallbackEdition.coverId || bestFallbackEdition.edition_olid;
                console.log(`   Falling back to ${bestFallbackEdition.languages.includes('English') ? 'latest English' : 'latest any-language'} edition with cover for main work cover (OLID: ${bestFallbackEdition.edition_olid}, Date: ${bestFallbackEdition.publish_date}, Cover ID: ${fallbackCoverId}). Fetching 'M' size.`);
                try {
                    const fallbackImageResultsArray = await file.getOlImage('edition', [fallbackCoverId], 'M');
                    mainWorkCoverUrl = fallbackImageResultsArray?.[0]?.localPath || null;
                    if (fallbackImageResultsArray?.[0]?.status && fallbackImageResultsArray[0].status.startsWith('skipped')) {
                        console.warn(`   Fallback edition cover for ID ${fallbackCoverId} was skipped by getOlImage: ${fallbackImageResultsArray[0].status}`);
                    }
                    // Check if it was successfully downloaded or cached, otherwise consider it failed
                    if (!mainWorkCoverUrl) {
                        console.warn(`   Fallback cover for OLID ${bestFallbackEdition.edition_olid} with Cover ID ${fallbackCoverId} could not be resolved to a local path.`);
                    }
                } catch (fallbackCoverErr) {
                    console.warn(`   - Failed to initiate cache/download for fallback edition cover ${fallbackCoverId}: ${fallbackCoverErr.message}`);
                }
            } else {
                console.log(`   - No suitable English or any-language edition with a valid cover identifier found for fallback for work ${work_olid}.`);
            }
        }

        // Return the combined and processed data
        return {
            workData: {
                ...workDetails, // Spread existing properties (title, authors, initial description)
                description: description, // Override with potentially richer description
                cover: mainWorkCoverUrl // Add the chosen main cover URL
            },
            workEditions: editionsWithCachedCovers, // All editions, now with covers and isInCollection flag
            totalEditionsCount: totalEditionsCount, // Include the total count of editions
            workScore // Include the work score data
        };

    } catch (error) {
        console.error(`   - Failed to retrieve work card data for work ${work_olid}:`, error.message);
        throw error;
    }
}

export async function getSearchResultCard(query) {
  const { works, totalCount } = await getAllSearchResults(query);
  const cards = await Promise.all(works.map(async work => {
    const work_olid = work.key.replace('/works/', '');
    const coverEdition = work.cover_edition_key;
    const first_publish_date = work.first_publish_date ?? work.first_publication_date ?? work.first_publish_year;
    const score = work_olid ? await db.getWorksScore(work_olid) : null;

    return {
      work_olid,
      title: work.title,
      author_names: work.author_name || [],
      edition_count: work.edition_count || 0,
      first_publish_date,
      language: work.language || [],
      cover_edition_key: coverEdition,
      workscore: score
    };
  }));

  return { cards, totalCount };
}


export async function getAllWorkEditions(workOlid) {
    let allEditions = [];
    let page = 1;
    const limit = 100; // Adjust as needed
    let totalEditionsCount = 0;

    // Define a blacklist/exclusion criteria
    const exclusionRules = [{
            titleContains: "just kidding row ling", // Case-insensitive check
            publishDate: "5555" // Specific date to exclude
        },
        // Add more rules here:
        // { olid: "OL1234567M" }, // Exclude a specific edition by its OLID
        // { titleContains: "test book", isbn: "9781234567890" }, // Exclude based on multiple criteria
        {
            publishDateGreaterThan: 2100
        } // Exclude any books published far in the future
    ];

    while (true) {
        try {
            const response = await ol.getOlData(
                "work_editions",
                workOlid,
                page,
                null,
                limit
            );

            if (response && response.entries) {
                // On the first successful call, capture the total size
                if (page === 1) {
                    totalEditionsCount = response.size || 0;
                }

                if (response.entries.length > 0) {
                    const newEntries = response.entries;

                    // --- APPLY BLACKLIST FILTER HERE ---
                    const filteredNewEntries = newEntries.filter(edition => {
                        const editionTitle = edition.title ? edition.title.toLowerCase() : '';
                        const editionPublishDate = edition.publish_date;

                        for (const rule of exclusionRules) {
                            let ruleMatches = true; // Assume rule matches until a condition fails

                            // Rule: titleContains
                            if (rule.titleContains && !editionTitle.includes(rule.titleContains.toLowerCase())) {
                                ruleMatches = false;
                            }
                            // Rule: publishDate
                            if (ruleMatches && rule.publishDate && editionPublishDate !== rule.publishDate) {
                                ruleMatches = false;
                            }
                            // Rule: olid
                            if (ruleMatches && rule.olid && edition.edition_olid !== rule.olid) {
                                ruleMatches = false;
                            }
                            // Rule: isbn
                            if (ruleMatches && rule.isbn && edition.isbn !== rule.isbn) {
                                ruleMatches = false;
                            }
                            // Rule: publishDateGreaterThan
                            if (ruleMatches && rule.publishDateGreaterThan) {
                                const yearMatch = editionPublishDate ? String(editionPublishDate).match(/\b(\d{4})\b/) : null;
                                if (!(yearMatch && parseInt(yearMatch[1], 10) >= rule.publishDateGreaterThan)) {
                                    // If this condition is NOT met, then this rule does not apply for exclusion
                                    ruleMatches = false;
                                }
                            }

                            // If all conditions for *this specific rule* match, then this edition should be excluded
                            if (ruleMatches && Object.keys(rule).length > 0) {
                                console.log(`   Exclusion Filter: Filtering out edition ${edition.edition_olid || edition.key} (Work ${workOlid}) due to rule: ${JSON.stringify(rule)}. Title: "${edition.title}", Date: "${edition.publish_date}".`);
                                return false; // Exclude this edition
                            }
                        }
                        return true; // Keep this edition if no rule matched it for exclusion
                    });

                    allEditions = allEditions.concat(filteredNewEntries);

                    // Break if we received less entries than the limit, indicating no more pages
                    // Or if total number of collected editions has reached or exceeded the reported totalEditionsCount
                    if (newEntries.length < limit) {
                        break;
                    }
                    page++; // Move to the next page
                } else {
                    // No more entries on this page, or an empty entries array was returned
                    console.warn(`   - No entries or unexpected response format for work ${workOlid} on page ${page}.`);
                    break;
                }
            } else {
                console.warn(`   - Empty or invalid response from Open Library for work editions ${workOlid} on page ${page}.`);
                break;
            }
        } catch (error) {
            console.error(`   - Error fetching work editions for ${workOlid} on page ${page}:`, error.message);
            break;
        }
    }

    //Pick out what look like duplicates (same isbn, language, publisher and publish date)
    const seenKeys = new Set();
    const uniqueEditions = [];

    for (const edition of allEditions) { // `allEditions` now contains pre-filtered data
        // Normalize properties to create a consistent key
        const isbn = edition.isbn || ''; // Assuming isbn is a single string
        // Languages and publishers are arrays; sort and join them for consistent key
        const languages = (edition.languages && Array.isArray(edition.languages) && edition.languages.length > 0) ?
            edition.languages.slice().sort().join('|') // Use slice() to avoid modifying original array
            :
            '';
        const publishers = (edition.publishers && Array.isArray(edition.publishers) && edition.publishers.length > 0) ?
            edition.publishers.slice().sort().join('|') :
            '';
        const publishDate = edition.publish_date || '';

        // Create a unique key string by concatenating normalized values
        const key = `${isbn}_::_${languages}_::_${publishers}_::_${publishDate}`;

        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniqueEditions.push(edition);
        } else {
            console.log(`   Deduplication: Filtering out edition ${edition.edition_olid || edition.key} (Work ${workOlid}) due to identical ISBN, languages, publishers, and publish date.`);
        }
    }
    allEditions = uniqueEditions; // `allEditions` now contains unique and pre-filtered data


    // After retrieving all the editions we now filter out ones where there's no identifying info as users wont be able to know if it's their edition.
    // If there's only one edition found for the work, keep it regardless of its data quality.
    if (allEditions.length === 1) {
        console.log(`   Only one edition found for work ${workOlid}. Keeping it as is.`);
        return {
            editions: allEditions,
            totalCount: totalEditionsCount // totalCount remains the count from OL, not filtered count
        };
    }

    const filteredEditions = [];
    // Map to group editions by language. Key: full language name (e.g., "English"), Value: Array of editions in that language
    const editionsByLanguage = new Map();

    // First pass: Populate editionsByLanguage map with processed language names
    for (const edition of allEditions) {
        const editionLanguages = (edition.languages && Array.isArray(edition.languages) && edition.languages.length > 0) ?
            edition.languages : ['No Language Specified']; // Consistent placeholder for editions without a defined language

        for (const langName of editionLanguages) {
            if (!editionsByLanguage.has(langName)) {
                editionsByLanguage.set(langName, []);
            }
            editionsByLanguage.get(langName).push(edition);
        }
    }

    // Second pass: Apply filtering rules based on missing identifiers
    for (const edition of allEditions) {
        const hasNoISBN = !edition.isbn;
        const hasNoPublisher = !edition.publishers || edition.publishers.length === 0;
        const hasNoPublishDate = !edition.publish_date || edition.publish_date === 'Unknown';

        const isMissingAllIdentifiers = hasNoISBN && hasNoPublisher && hasNoPublishDate;

        if (!isMissingAllIdentifiers) {
            filteredEditions.push(edition);
        } else {
            let shouldKeepBecauseOnlyOneInLanguage = false;
            const editionLanguages = (edition.languages && Array.isArray(edition.languages) && edition.languages.length > 0) ?
                edition.languages : ['No Language Specified'];

            for (const langName of editionLanguages) {
                const editionsInThisLanguage = editionsByLanguage.get(langName);
                if (editionsInThisLanguage && editionsInThisLanguage.length === 1 && langName !== 'No Language Specified') {
                    shouldKeepBecauseOnlyOneInLanguage = true;
                    console.log(`   Filtering: Edition ${edition.edition_olid || edition.key} (Work ${workOlid}) missing identifiers but kept as it's the only one in language: '${langName}'.`);
                    break;
                }
            }

            if (shouldKeepBecauseOnlyOneInLanguage) {
                filteredEditions.push(edition);
            } else {
                console.log(`   Filtering: Filtering out edition ${edition.edition_olid || edition.key} (Work ${workOlid}) because it's missing ISBN, publisher, and publish date, and isn't the sole edition in a specific language.`);
            }
        }
    }

    return {
        editions: filteredEditions,
        totalCount: totalEditionsCount
    };
}

/**
 * Fetches Open Library search results up to a configurable max pages, filtering out works with no editions.
 *
 * @param {string} query - The search query string.
 * @param {object} [options]
 * @param {number} [options.limitPerPage=100] - Number of docs per page.
 * @param {number} [options.maxPages=25] - Maximum number of pages to fetch.
 * @param {number} [options.concurrency=10] - Max concurrent fetches.
 * @returns {Promise<{works: object[], totalCount: number}>}
 */
export async function getAllSearchResults(query, {
  limitPerPage = 100,
  maxPages = 10,
  concurrency = 10
} = {}) {
  let filteredWorks = [];

  try {
    // 1. Fetch first page
    const firstResp = await ol.getOlData('search', query, 1, null, limitPerPage);
    if (!firstResp?.docs?.length) {
      console.warn('No valid search data received for first page.');
      return { works: [], totalCount: 0 };
    }

    filteredWorks = firstResp.docs.filter(d => (d.edition_count || 0) > 0);
    const totalCount = firstResp.num_found || 0;
    const totalPages = Math.ceil(totalCount / limitPerPage);
    const pagesToFetch = Math.min(totalPages, maxPages);

    // 2. Prepare remaining pages (if any)
    const remaining = [];
    for (let p = 2; p <= pagesToFetch; p++) remaining.push(p);

    // 3. Fetch in batches with concurrency control
    async function fetchPage(p) {
      try {
        const r = await ol.getOlData('search', query, p, null, limitPerPage);
        return Array.isArray(r.docs) ? r.docs.filter(d => (d.edition_count || 0) > 0) : [];
      } catch (e) {
        console.warn(`Page ${p} fetch failed: ${e.message}`);
        return [];
      }
    }

    async function fetchInBatches(pageNums, batchSize) {
      const out = [];
      for (let i = 0; i < pageNums.length; i += batchSize) {
        const batch = pageNums.slice(i, i + batchSize);
        const res = await Promise.all(batch.map(fetchPage));
        res.forEach(arr => out.push(...arr));
      }
      return out;
    }

    // 4. Run the fetches
    const rest = await fetchInBatches(remaining, concurrency);
    filteredWorks = filteredWorks.concat(rest);

    return { works: filteredWorks, totalCount };

  } catch (err) {
    console.error(`getAllSearchResults failed: ${err.message}`);
    return { works: [], totalCount: 0 };
  }
}
