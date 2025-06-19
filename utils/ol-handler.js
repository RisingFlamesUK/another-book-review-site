// this file is book-handler-js
import axios from "axios";
import * as utils from './utils.js'

const base_url = 'https://openlibrary.org'

/**
 * Fetches data from the Open Library API.
 *
 * @param {"search" | "edition" | "author" | "works" | "languages" | "trending" | "subject"} type - The type of data to fetch. Valid values are "search", "edition", "author", "works", "languages", "trending" or subject.
 * @param {string} criteria - The search term, edition OLID, author OLID, or work OLID, or can be empty for "languages" type, or "hourly", "daily" or "weekly" for "trending", or the desired subject for "subject".
 * @returns {Promise<any>} - A promise that resolves to the API response data. Returns null for specific "not found" cases, or throws an error on API/data issues.
 */
//get data from Open Library
export async function getOlData(type, criteria, page = 1, language = null, limit = null) {
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
            case "search": { // Use block scope for variables
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
                        searchLanguage = "+language:eng";
                        console.warn(`getOlData: language ${language} was not found in cache. 'English' has been used for this search`)
                    } else {
                        searchLanguage = "+language:" + searchLanguage;
                    }
                }

                let limit = '';
                if(limit) {
                    limit = '&limit=' + limit;
                } else {
                    limit = '&mode=everything';
                }
                const searchUrl = `${base_url}/search.json?q=${encodedTitle}${searchLanguage}&page=${page}${limit}`;
                console.log(`Fetching search results for: ${searchUrl}`);
                const searchResponse = await axios.get(searchUrl, {
                    timeout: requestTimeout
                });

                if (searchResponse.status !== 200) {
                    throw new Error(`Search API returned non-200 status: ${searchResponse.status} ${searchResponse.statusText}`);
                }
                if (!searchResponse.data || !Array.isArray(searchResponse.data.docs)) {
                    console.warn('Received unexpected data format for search results. Expected data.docs array.');
                    responseData = {
                        docs: []
                    };
                } else {
                    responseData = searchResponse.data;
                }
                break;
            }
            case "edition": {
                const axiosResponse = await axios.get(`${base_url}/books/${criteria}.json`, {
                    timeout: requestTimeout
                });

                if (axiosResponse.status !== 200) {
                    throw new Error(`Edition API returned non-200 status: ${axiosResponse.status} ${axiosResponse.statusText}`);
                }

                const data = axiosResponse.data;
                if (!data) {
                    return null;
                }

                const title = data.title;
                const publish_date = data.publish_date;
                const description = data.description?.value ?? data?.description ?? null;
                const cover_url = `https://covers.openlibrary.org/b/olid/${criteria}-L.jpg`;
                const languages_key = utils.formatPrefix('languages', data.languages);
                const rawLanguages = utils.languageLookup('key', languages_key, 'language');
                const languages = (rawLanguages || []).filter(Boolean);
                const workOlid = utils.formatPrefix('works', data.works);
                const authorsResult = data.authors;
                let authors = [];
                if (authorsResult?.length > 0) {
                    authors = utils.formatPrefix("authors", authorsResult);
                }

                responseData = {
                    edition_olid: criteria,
                    work_olid: workOlid,
                    languages: languages,
                    title: title,
                    publish_date: publish_date,
                    description: description,
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
                    throw new Error(`Author API returned non-200 status: ${axiosResponse.status} ${axiosResponse.statusText}`);
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
                    pic_url: pic_url_val
                };
                break;
            }
            case "works": {
                const axiosResponse = await axios.get(`${base_url}/works/${criteria}.json`, {
                    timeout: requestTimeout
                });

                if (axiosResponse.status !== 200) {
                    throw new Error(`Works API returned non-200 status: ${axiosResponse.status} ${axiosResponse.statusText}`);
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
                    authors: authorsOlids,
                    cover_edition: cover_edition
                };
                break;
            }
            case "languages": {
                const response = await axios.get(`${base_url}/languages.json`, {
                    timeout: requestTimeout * 4
                });

                if (response.status !== 200) {
                    console.error(`API returned non-200 status: ${response.status} ${response.statusText}`);
                    throw new Error(`Failed to fetch languages: Server responded with status ${response.status}`);
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
                            console.warn('Skipping malformed language object:', language);
                            return null;
                        }
                    }).filter(Boolean);
                } else {
                    console.warn('response.data is not an array or is empty for languages.');
                }
                return languages; // Languages case directly returns the array
            }

            case "trending": {
                // defensive check
                criteria = criteria || 'monthly';
                if (criteria !== "hourly" && criteria !== 'daily' && criteria !== "weekly" && criteria !== "monthly") {
                    console.error(`- getOlData: unrecognised criteria: ${criteria}. Expecting 'hourly' || 'daily' || 'weekly' || 'monthly'`);
                    throw new Error(`getOlData: Failed to fetch trending: unrecognised criteria: ${criteria}`);
                }

                const searchUrl = `${base_url}/trending/${criteria}.json`;
                console.log(`Fetching search results for: ${searchUrl}`);

                const response = await axios.get(searchUrl, {
                    timeout: requestTimeout * 4
                });


                if (response.status !== 200) {
                    console.error(`API returned non-200 status: ${response.status} ${response.statusText}`);
                    throw new Error(`Failed to fetch trending: Server responded with status ${response.status}`);
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
                        console.warn(`    getOlData: language ${language} was not found in cache. 'English' has been used for this search`)
                    } else {
                        searchLanguage = "+language:" + searchLanguage;
                    }

                }

                const response = await axios.get(`${base_url}/search.json?q=subject:${criteria} readinglog_count:[1 TO *]${searchLanguage}&sort=random.hourly&limit=${limit || 10}`, {
                    timeout: requestTimeout
                });

                if (response.status !== 200) {
                    console.error(`API returned non-200 status: ${response.status} ${response.statusText}`);
                    throw new Error(`Failed to fetch subject ${criteria}: Server responded with status ${response.status}`);
                }

                let subjectBooks = response.data;

                return subjectBooks;
            }

            default: { // Handles the 'else' case
                const error = new Error(`Invalid type parameter: ${type}`);
                error.statusCode = 400;
                throw error;
            }
        }



        return responseData;

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`Axios error fetching data from Open Library for ${type} ${criteria}:`, error.message);
            if (error.response) {
                if (error.response.status === 404) {
                    throw new Error(`Data not found for ${type} OLID: ${criteria}. (Status: 404)`);
                }
                throw new Error(`Open Library API error for ${type} ${criteria}: ${error.response.status} - ${error.response.statusText}`);
            } else if (error.request) {
                throw new Error(`No response from Open Library API for ${type} ${criteria}. Network error?`);
            } else {
                throw new Error(`Error setting up Open Library API request for ${type} ${criteria}: ${error.message}`);
            }
        } else {
            console.error(`Error in getOlData for ${type} ${criteria}:`, error);
            throw error;
        }
    }
}