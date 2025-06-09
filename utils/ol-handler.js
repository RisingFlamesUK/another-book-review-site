// this file is book-handler-js
import axios from "axios";
import * as utils from './utils.js'

const base_url = 'https://openlibrary.org'

/**
 * Fetches data from the Open Library API.
 *
 * @param {"search" | "edition" | "author" | "works" | "languages"} type - The type of data to fetch. Valid values are "search", "edition", "author", "works", or "languages".
 * @param {string} criteria - The search term, edition ID, author ID, or work ID, or can be empty for "languages" type.
 * @returns {Promise<any>} - A promise that resolves to the API response data. Returns null for specific "not found" cases, or throws an error on API/data issues.
 */
//get data from Open Library
export async function getData(type, criteria, page = 1) {
    // Initial input validation for required parameters
    if (!type) {
        const error = new Error('Type parameter is required for Open Library API call.');
        error.statusCode = 400; // Bad Request
        throw error;
    }

    if (['search', 'edition', 'author', 'works'].includes(type) && !criteria) {
        const error = new Error(`Criteria is required for '${type}' Open Library API call.`);
        error.statusCode = 400;
        throw error;
    }

    try {
        let responseData;
        const requestTimeout = 5000;

        if (type === "search") {
            const encodedTitle = encodeURIComponent(criteria);
            const searchUrl = `${base_url}/search.json?title=${encodedTitle}&page=${page}`;
            console.log(`Fetching search results for: ${searchUrl}`);
            const searchResponse = await axios.get(searchUrl, {
                timeout: requestTimeout
            });

            // Validate search response status
            if (searchResponse.status !== 200) {
                throw new Error(`Search API returned non-200 status: ${searchResponse.status} ${searchResponse.statusText}`);
            }
            // Validate search data structure
            if (!searchResponse.data || !Array.isArray(searchResponse.data.docs)) {
                console.warn('Received unexpected data format for search results. Expected data.docs array.');
                responseData = {
                    docs: []
                }; // Return empty docs array if not found
            } else {
                responseData = searchResponse.data;
            }

        } else if (type === "edition") {
            const axiosResponse = await axios.get(`${base_url}/books/${criteria}.json`, {
                timeout: requestTimeout
            });

            // Validate edition response status
            if (axiosResponse.status !== 200) {
                throw new Error(`Edition API returned non-200 status: ${axiosResponse.status} ${axiosResponse.statusText}`);
            }

            const data = axiosResponse.data;
            if (!data) {
                return null; // No data returned for the edition
            }

            const title = data.title;
            const publish_date = data.publish_date;
            const description = data.description?.value ?? data?.description ?? null;
            const cover_url = `https://covers.openlibrary.org/b/olid/${criteria}-L.jpg`;
            const languages_key = utils.formatPrefix('languages', data.languages);
            const languages = utils.languageLookup('key',languages_key, 'language');
            const workOlid = utils.formatPrefix('works', data.works);

            responseData = {
                edition_olid: criteria,
                work_olid: workOlid,
                languages: languages,
                title: title,
                publish_date: publish_date,
                description: description,
                cover_url: cover_url

            }

        } else if (type === "author") {
            const axiosResponse = await axios.get(`${base_url}/authors/${criteria}.json`, {
                timeout: requestTimeout
            });

            // Validate author response status
            if (axiosResponse.status !== 200) {
                throw new Error(`Author API returned non-200 status: ${axiosResponse.status} ${axiosResponse.statusText}`);
            }

            const data = axiosResponse.data;
            if (!data) {
                return null; // No data returned for the author
            }

            const pics = data?.photos ?? data?.pics;
            let pic_url = undefined;
            if (pics) {
                const picId = Array.isArray(pics) ? pics[0] : pics;
                if (picId) { // Ensure picId is not null/undefined
                    pic_url = `https://covers.openlibrary.org/a/id/${picId}-M.jpg`;
                }
            }

            const name = data.name;
            const bio = data.bio?.value ?? data.bio ?? null;
            const birth_date = data.birth_date;
            const death_date = data.death_date;

            responseData = {
                author_olid: criteria,
                name: name,
                bio: bio,
                birth_date: birth_date,
                death_date: death_date,
                pic_url: pic_url
            }

        } else if (type === "works") {
            const axiosResponse = await axios.get(`${base_url}/works/${criteria}.json`, {
                timeout: requestTimeout
            });

            // Validate works response status
            if (axiosResponse.status !== 200) {
                throw new Error(`Works API returned non-200 status: ${axiosResponse.status} ${axiosResponse.statusText}`);
            }

            const data = axiosResponse.data;
            if (!data) {
                return null; // No data returned for the work
            }

            const title = data.title;
            const first_publication_date = data.first_publish_date ?? data.first_publication_date ?? null;
            const subjects = data.subjects && Array.isArray(data.subjects) ? data.subjects : [];
            const description = data.description?.value ?? data?.description ?? null;
            const authors = data?.authors ?? null;

            let authorsOlids = [];
            if (authors && Array.isArray(authors)) {
                const authorsForFormatPrefix = authors.map(author => {
                    // Ensure author.author and author.author.key exist before trying to access
                    if (author && author.author && typeof author.author.key === 'string') {
                        return {
                            key: author.author.key
                        };
                    }
                    // Log a warning and return null for any malformed author objects
                    console.warn('Skipping malformed author object in authors array:', author);
                    return null;
                }).filter(Boolean);
                authorsOlids = utils.formatPrefix('authors', authorsForFormatPrefix);
            } else {
                console.warn(`Works OLID ${criteria} did not contain the expected 'authors' array or it was null.`);
            }

            responseData = {
                work_olid: criteria,
                title: title,
                first_publication_date: first_publication_date,
                subjects: subjects,
                description: description,
                authors: authorsOlids
            }

        } else if (type === "languages") {
            const response = await axios.get(`${base_url}/languages.json`, {
                timeout: requestTimeout
            });

            // Validate the response status code
            if (response.status !== 200) {
                console.error(`API returned non-200 status: ${response.status} ${response.statusText}`);
                throw new Error(`Failed to fetch languages: Server responded with status ${response.status}`);
            }

            // Validate response.data exists and is an array
            let languages = [];
            if (response.data && Array.isArray(response.data)) {
                languages = response.data.map((language) => {
                    // Check for expected properties before accessing them
                    if (language && typeof language.key === 'string' && typeof language.name === 'string') {
                        const formattedKeysArray = utils.formatPrefix('languages', [{
                            key: language.key
                        }]);

                        const cleanedKey = formattedKeysArray.length > 0 ? formattedKeysArray[0] : language.key.split('/').pop();

                        return {
                            language: language.name,
                            key: cleanedKey // This 'key' is now the cleaned 'eng', 'ger', etc.
                        };
                    } else {
                        console.warn('Skipping malformed language object:', language);
                        return null; // Return null for malformed objects
                    }
                }).filter(Boolean); // Filter out any nulls that resulted from malformed objects
            } else {
                console.warn('response.data is not an array or is empty for languages.');
            }
            return languages;

        } else {
            const error = new Error(`Invalid type parameter: ${type}`);
            error.statusCode = 400; // Bad Request
            throw error;
        }

        return responseData;

    } catch (error) {
        if (axios.isAxiosError(error)) {
            // Handle Axios specific errors (e.g., network issues, 404s, 500s from OL)
            console.error(`Axios error fetching data from Open Library for ${type} ${criteria}:`, error.message);
            // Re-throw with a more generic message if it's a 404 or network error
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                if (error.response.status === 404) {
                    throw new Error(`Data not found for ${type} OLID: ${criteria}. (Status: 404)`);
                }
                throw new Error(`Open Library API error for ${type} ${criteria}: ${error.response.status} - ${error.response.statusText}`);
            } else if (error.request) {
                // The request was made but no response was received
                throw new Error(`No response from Open Library API for ${type} ${criteria}. Network error?`);
            } else {
                // Something else happened in setting up the request that triggered an Error
                throw new Error(`Error setting up Open Library API request for ${type} ${criteria}: ${error.message}`);
            }
        } else {
            // Handle other types of errors (e.g., from your own validation within the function)
            console.error(`Error in getData for ${type} ${criteria}:`, error);
            throw error; // Re-throw the original error if it's already a custom one
        }
    }
}