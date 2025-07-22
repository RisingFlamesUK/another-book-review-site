// this file is book-handler-js
import axios from "axios";
import * as utils from './utils.js'

const base_url = 'https://openlibrary.org'

/**
 * Fetches data from the Open Library API.
 *
 * @param {"search" | "edition" | "author" | "works" | "languages" | "trending" | "subject" | "work_editions"} type - The type of data to fetch. Valid values are "search", "edition", "author", "works", "languages", "trending", "subject", or "work_editions".
 * @param {string} criteria - The search term, edition OLID, author OLID, or work OLID, or can be empty for "languages" type, or "hourly", "daily" or "weekly" for "trending", or the desired subject for "subject", or work_olid for "work_editions".
 * @param {number} [page=1] - The page number for paginated results (e.g., search, work_editions).
 * @param {string} [language=null] - The language for search or subject queries.
 * @param {number} [limit=null] - The maximum number of results to return.
 * @returns {Promise<any>} - A promise that resolves to the API response data. Returns null for specific "not found" cases, or throws an error on API/data issues.
 */
export async function getOlData(type, criteria, page = 1, language = null, limit = null, offset = null, workSearchFields = 'author_key,author_name,cover_edition_key,cover_i,edition_count, edition_key,first_publish_year,first_publish_date,first_publication_date,key,language,title,subject,publishers') {
    // Initial input validation for required parameters
    if (!type) {
        const error = new Error('Type parameter is required for Open Library API call.');
        error.statusCode = 400; // Bad Request
        throw error;
    }

    if (['search', 'edition', 'author', 'works', 'subject'].includes(type) && !criteria) {
        const error = new Error(`Criteria is required for '${type}' Open Library API call.`);
        error.statusCode = 400;
        throw error;
    }

    try {
        let responseData;
        const requestTimeout = 5000;

        switch (type) {
            case "search": {
                const encodedTitle = encodeURIComponent(criteria);
                let searchLanguage = null;
                if (language?.length > 0) {
                    searchLanguage = utils.languageLookup('key', language, 'key') || utils.languageLookup('language', language, 'key');
                    if (searchLanguage) {
                        searchLanguage = `+language:${searchLanguage}`;
                    }
                }

                const queryParams = [`q=${encodedTitle}`];
                if (searchLanguage) queryParams.push(searchLanguage);
                if (limit) queryParams.push(`limit=${limit}`);
                if (page && !offset) queryParams.push(`page=${page}`);
                if (offset) queryParams.push(`offset=${offset}`);

                const searchUrl = `${base_url}/search.json?${queryParams.join('&')}`;
                console.log(`   getOlData: Fetching search results for: ${searchUrl}`);

                const searchResponse = await axios.get(searchUrl, {
                    timeout: requestTimeout *2
                });
                if (searchResponse.status !== 200) {
                    throw new Error(`Search API returned non-200 status: ${searchResponse.status}`);
                }

                responseData = searchResponse.data || {
                    docs: []
                };

                if (responseData.docs?.length > 0) {
                    responseData.docs.forEach(doc => {
                        if (Array.isArray(doc.author_name)) {
                            doc.author_name = doc.author_name.map(name => utils.toTitleCase(name));
                        }
                    });
                }

                break;
            }
            case "work-search": { // Use block scope for variables
                const encodedTitle = encodeURIComponent(criteria);
                let searchLanguage;
                if (language?.length === 0) {
                    searchLanguage = null;
                } else {
                    searchLanguage = utils.languageLookup('key', language, 'key');
                    if (!searchLanguage) {
                        searchLanguage = utils.languageLookup('language', language, 'key');
                    }
                    if (!searchLanguage) {

                    } else {
                        searchLanguage = "+language:" + searchLanguage;
                    }
                }

                let limit = '';
                if (limit) {
                    limit = '&limit=' + limit;
                } else {
                    limit = '&mode=everything';
                }
                const searchUrl = `${base_url}/search.json?q=${encodedTitle}${searchLanguage || ''}&page=${page}${limit}&fields=${workSearchFields}`;
                console.log(`   getOlData: Fetching search results for: ${searchUrl}`);
                const searchResponse = await axios.get(searchUrl, {
                    timeout: requestTimeout
                });

                if (searchResponse.status !== 200) {
                    throw new Error(`Search API returned non-200 status: ${searchResponse.status} ${searchResponse.statusText}`);
                }
                if (!searchResponse.data || !Array.isArray(searchResponse.data.docs)) {
                    console.warn('   - getOlData: Received unexpected data format for search results. Expected data.docs array.');
                    responseData = {
                        docs: []
                    };
                } else {
                    responseData = searchResponse.data;
                }

                if (responseData.docs?.length > 0) {
                    responseData.docs.forEach(doc => {
                        if (Array.isArray(doc.author_name)) {
                            doc.author_name = doc.author_name.map(name => utils.toTitleCase(name));
                        }
                    });
                }

                break;
            }
            case "edition": {
                const axiosResponse = await axios.get(`${base_url}/books/${criteria}.json`, {
                    timeout: requestTimeout
                });

                if (axiosResponse.status !== 200) {
                    throw new Error(`   - getOlData: Edition API returned non-200 status: ${axiosResponse.status} ${axiosResponse.statusText}`);
                }

                const data = axiosResponse.data;
                if (!data) {
                    return null;
                }

                const title = data.title;
                const publishers = data.publishers;
                const publish_date = data.publish_date;
                const description = data.description?.value ?? data?.description ?? null;
                const cover_url = `https://covers.openlibrary.org/b/olid/${criteria}-M.jpg`;
                const languages_key = utils.formatPrefix('languages', data.languages);
                const rawLanguages = utils.languageLookup('key', languages_key, 'language');
                const languages = (rawLanguages || []).filter(Boolean);
                const workOlid = utils.formatPrefix('works', data.works);
                const authorsResult = data.authors;
                let authors = [];
                if (authorsResult?.length > 0) {
                    authors = utils.formatPrefix("authors", authorsResult);
                }
                // Open Library can have isbn_10 or isbn_13, and they can be arrays.
                // Prioritize isbn_13 if available, then isbn_10, and take the first one if it's an array.
                let isbn = null;
                if (data.isbn_13 && Array.isArray(data.isbn_13) && data.isbn_13.length > 0) {
                    isbn = data.isbn_13[0];
                } else if (data.isbn_10 && Array.isArray(data.isbn_10) && data.isbn_10.length > 0) {
                    isbn = data.isbn_10[0];
                } else if (typeof data.isbn === 'string' && data.isbn.trim() !== '') {
                    // Sometimes 'isbn' might be a direct string field, though less common for editions
                    isbn = data.isbn;
                } else if (Array.isArray(data.isbn) && data.isbn.length > 0 && typeof data.isbn[0] === 'string') {
                    // Fallback for a generic 'isbn' array
                    isbn = data.isbn[0];
                }
                // Ensure ISBN is a string, if not, set to null.
                isbn = typeof isbn === 'string' && isbn.trim() !== '' ? isbn.trim() : null;

                responseData = {
                    edition_olid: criteria,
                    work_olid: workOlid,
                    languages: languages,
                    title: title,
                    publishers: publishers,
                    publish_date: publish_date,
                    description: description,
                    isbn: isbn,
                    cover_url: cover_url,
                    authors: authors
                };
                break;
            }
            case "author": {
                const axiosResponse = await axios.get(`${base_url}/authors/${criteria}.json`, {
                    timeout: requestTimeout
                });

                if (axiosResponse.status !== 200) {
                    throw new Error(`   - getOlData: Author API returned non-200 status: ${axiosResponse.status} ${axiosResponse.statusText}`);
                }

                const data = axiosResponse.data;
                if (!data) {
                    return null;
                }

                const pics = data?.photos ?? data?.pics;
                let pic_url_val = null;
                if (pics) {
                    const picId = Array.isArray(pics) ? pics[0] : pics;
                    if (picId && typeof picId === 'number' && picId > 0) {
                        pic_url_val = `https://covers.openlibrary.org/a/id/${picId}-M.jpg`;
                    }
                }

                const name = utils.toTitleCase(data.name);
                const bio = data.bio?.value ?? data.bio ?? null;
                const birth_date = data.birth_date;
                const death_date = data.death_date;

                responseData = {
                    author_olid: criteria,
                    name: name,
                    bio: bio,
                    birth_date: birth_date,
                    death_date: death_date,
                    pic_url: pic_url_val
                };
                break;
            }
            case "works": {
                const axiosResponse = await axios.get(`${base_url}/works/${criteria}.json`, {
                    timeout: requestTimeout
                });

                if (axiosResponse.status !== 200) {
                    throw new Error(`   - getOlData: Works API returned non-200 status: ${axiosResponse.status} ${axiosResponse.statusText}`);
                }

                const data = axiosResponse.data;
                if (!data) {
                    return null;
                }

                const title = data.title;
                const first_publication_date = data.first_publish_date ?? data.first_publication_date ?? null;
                const subjects = data.subjects && Array.isArray(data.subjects) ? data.subjects : [];
                const description = data.description?.value ?? data?.description ?? null;
                const authors = data?.authors ?? null;
                let cover_edition = null;
                if (data?.cover_edition?.key?.length > 0) { // Added nullish coalescing for safety
                    cover_edition = utils.formatPrefix("edition", [data.cover_edition]);
                }

                let authorsOlids = [];
                if (authors && Array.isArray(authors)) {
                    const authorsForFormatPrefix = authors.map(author => {
                        if (author && author.author && typeof author.author.key === 'string') {
                            return {
                                key: author.author.key
                            };
                        }
                        console.warn('   - getOlData: Skipping malformed author object in authors array:', author);
                        return null;
                    }).filter(Boolean);
                    authorsOlids = utils.formatPrefix('authors', authorsForFormatPrefix);
                } else {
                    console.warn(`   - getOlData: Works OLID ${criteria} did not contain the expected 'authors' array or it was null.`);
                }

                responseData = {
                    work_olid: criteria,
                    title: title,
                    first_publication_date: first_publication_date,
                    subjects: subjects,
                    description: description,
                    authors: authorsOlids,
                    author_name: utils.toTitleCase(data.author),
                    cover_edition: cover_edition
                };
                break;
            }

            case "work_editions": {
                let requestUrl = `${base_url}/works/${criteria}/editions.json`;
                const queryParams = [];

                if (limit && limit > 0) {
                    queryParams.push(`limit=${limit}`);
                }

                // Calculate offset from page and limit if both are valid
                if (page && page > 0 && limit && limit > 0) {
                    const offset = (page - 1) * limit;
                    queryParams.push(`offset=${offset}`);
                }

                if (queryParams.length > 0) {
                    requestUrl += `?${queryParams.join('&')}`;
                }

                console.log(`   getOlData: Fetching work editions for: ${requestUrl}`);

                const axiosResponse = await axios.get(requestUrl, {
                    timeout: requestTimeout
                });

                if (axiosResponse.status !== 200) {
                    if (axiosResponse.status === 404) {
                        console.warn(`   - getOlData: No editions found for work OLID: ${criteria}`);
                        // Return an empty array of entries and 0 total if not found
                        return {
                            entries: [],
                            size: 0
                        };
                    }
                    throw new Error(`   - getOlData: Works API returned non-200 status for editions: ${axiosResponse.status} ${axiosResponse.statusText}`);
                }

                const data = axiosResponse.data;
                if (!data || !Array.isArray(data.entries)) {
                    console.warn(`   - getOlData: Received unexpected data format for work_editions for work OLID: ${criteria}. Expected data.entries array.`);
                    // Return an empty array of entries and 0 total if data format is unexpected
                    return {
                        entries: [],
                        size: 0
                    };
                }

                const mappedEntries = data.entries.map(entry => {
                    const edition_olid = entry.key ? entry.key.replace('/books/', '') : null;
                    const coverId = entry.covers && entry.covers.length > 0 ? entry.covers[0] : null;

                    // Determine ISBN (prioritize ISBN-13 over ISBN-10)
                    let isbn = null;
                    if (entry.isbn_13 && Array.isArray(entry.isbn_13) && entry.isbn_13.length > 0) {
                        isbn = entry.isbn_13[0];
                    } else if (entry.isbn_10 && Array.isArray(entry.isbn_10) && entry.isbn_10.length > 0) {
                        isbn = entry.isbn_10[0];
                    }

                    // Determine if it's an eBook.
                    // The 'physical_format' is a good direct indicator if present.
                    const isEbook = entry.physical_format && entry.physical_format.toLowerCase() === 'ebook';

                    // Extract and format languages
                    let languages = [];
                    if (entry.languages && Array.isArray(entry.languages) && entry.languages.length > 0) {
                        // Extract just the 'key' from each language object
                        const languageKeys = entry.languages.map(lang => lang.key);
                        // Use languageLookup to get the full language names
                        const rawLanguages = utils.languageLookup('key', languageKeys, 'language');
                        languages = (rawLanguages || []).filter(Boolean); // Filter out any null/undefined results
                    }

                    return {
                        edition_olid: edition_olid,
                        title: entry.title || 'Untitled Edition', // Provide a fallback
                        publishers: Array.isArray(entry.publishers) ? entry.publishers : [],
                        publish_date: entry.publish_date || 'Unknown',
                        coverId: coverId,
                        eBook: isEbook,
                        isbn: isbn,
                        languages: languages,
                    };
                });

                // Return an object containing both the mapped entries and the total size
                responseData = {
                    entries: mappedEntries,
                    size: data.size
                };

                break;
            }

            case "languages": {
                const response = await axios.get(`${base_url}/languages.json`, {
                    timeout: requestTimeout * 4
                });

                if (response.status !== 200) {
                    console.error(`   - getOlData: API returned non-200 status: ${response.status} ${response.statusText}`);
                    throw new Error(`   - getOlData: Failed to fetch languages: Server responded with status ${response.status}`);
                }

                let languages = [];
                if (response.data && Array.isArray(response.data)) {
                    languages = response.data.map((language) => {
                        if (language && typeof language.key === 'string' && typeof language.name === 'string') {
                            const formattedKeysArray = utils.formatPrefix('languages', [{
                                key: language.key
                            }]);

                            const cleanedKey = formattedKeysArray.length > 0 ? formattedKeysArray[0] : language.key.split('/').pop();

                            return {
                                language: language.name,
                                key: cleanedKey
                            };
                        } else {
                            console.warn('   - getOlData: Skipping malformed language object:', language);
                            return null;
                        }
                    }).filter(Boolean);
                } else {
                    console.warn('   - getOlData: response.data is not an array or is empty for languages.');
                }
                return languages; // Languages case directly returns the array
            }

            case "trending": {
                // defensive check
                criteria = criteria || 'monthly';
                if (criteria !== "hourly" && criteria !== 'daily' && criteria !== "weekly" && criteria !== "monthly") {
                    console.error(`   - getOlData: unrecognised criteria: ${criteria}. Expecting 'hourly' || 'daily' || 'weekly' || 'monthly'`);
                    throw new Error(`   - getOlData: Failed to fetch trending: unrecognised criteria: ${criteria}`);
                }

                const searchUrl = `${base_url}/trending/${criteria}.json`;
                console.log(`   getOlData: Fetching search results for: ${searchUrl}`);

                const response = await axios.get(searchUrl, {
                    timeout: requestTimeout * 4
                });


                if (response.status !== 200) {
                    console.error(`   - getOlData: API returned non-200 status: ${response.status} ${response.statusText}`);
                    throw new Error(`   - getOlData: Failed to fetch trending: Server responded with status ${response.status}`);
                }

                let trending = response.data.works;

                return trending;
            }

            case "subject": {
                let searchLanguage;
                if (language?.length === 0) {
                    searchLanguage = null;
                } else {
                    searchLanguage = utils.languageLookup('key', language, 'key');
                    if (!searchLanguage) {
                        searchLanguage = utils.languageLookup('language', language, 'key');
                    }
                    if (!searchLanguage) {
                        searchLanguage = "+language:eng";
                        console.warn(`   - getOlData: language ${language} was not found in cache. 'English' has been used for this Subject (${criteria}) search`)
                    } else {
                        searchLanguage = "+language:" + searchLanguage;
                    }

                }

                const response = await axios.get(`${base_url}/search.json?q=subject:${criteria} readinglog_count:[1 TO *]${searchLanguage}&sort=random.hourly&limit=${limit || 10}`, {
                    timeout: requestTimeout
                });

                if (response.status !== 200) {
                    console.error(`   - getOlData: API returned non-200 status: ${response.status} ${response.statusText}`);
                    throw new Error(`   - getOlData: Failed to fetch subject ${criteria}: Server responded with status ${response.status}`);
                }

                let subjectBooks = response.data;

                return subjectBooks;
            }

            default: { // Handles the 'else' case
                const error = new Error(`   - getOlData: Invalid type parameter: ${type}`);
                error.statusCode = 400;
                throw error;
            }
        }

        return responseData;

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`   - getOlData: Axios error fetching data from Open Library for ${type} ${criteria}:`, error.message);
            if (error.response) {
                if (error.response.status === 404) {
                    throw new Error(`   - getOlData: Data not found for ${type} OLID: ${criteria}. (Status: 404)`);
                }
                throw new Error(`   - getOlData: Open Library API error for ${type} ${criteria}: ${error.response.status} - ${error.response.statusText}`);
            } else if (error.request) {
                throw new Error(`   - getOlData: No response from Open Library API for ${type} ${criteria}. Network error?`);
            } else {
                throw new Error(`   - getOlData: Error setting up Open Library API request for ${type} ${criteria}: ${error.message}`);
            }
        } else {
            console.error(`   - getOlData: Error in getOlData for ${type} ${criteria}:`, error);
            throw error;
        }
    }
}