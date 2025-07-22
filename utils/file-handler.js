// This file is /utils/file-handler.js
import {
    promises as fsPromises
} from 'fs';
import {
    createWriteStream
} from 'fs';
import path from 'path';
import {
    fileURLToPath
} from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to process a single image download
// Returns an object with detailed status, including original input and localPath (if successful)
async function _processSingleOlImage(imageType, olIdOrUrl, size = 'M') {
    let remoteImageUrl;
    let outputPath;
    let storedURL;
    let tempPath;
    let baseFileName;

    try {
        if (!olIdOrUrl || olIdOrUrl === -1) {
            return {
                originalInput: olIdOrUrl,
                status: 'skipped',
                reason: `No valid Open Library ID or URL provided (value: ${olIdOrUrl})`,
                remoteImageUrl: undefined,
                localPath: undefined
            };
        }

        if (typeof olIdOrUrl === 'string' && olIdOrUrl.startsWith('http')) {
            const urlParts = new URL(olIdOrUrl);
            const pathSegments = urlParts.pathname.split('/');
            baseFileName = pathSegments[pathSegments.length - 1].split('?')[0];
            remoteImageUrl = olIdOrUrl;
        } else {
            let idOrOlidPrefix;
            if (imageType === 'author') {
                idOrOlidPrefix = 'id';
            } else if (imageType === 'edition') {
                if (typeof olIdOrUrl === 'number' || (typeof olIdOrUrl === 'string' && !isNaN(Number(olIdOrUrl)) && !olIdOrUrl.startsWith('OL'))) {
                    idOrOlidPrefix = 'id';
                } else if (typeof olIdOrUrl === 'string' && olIdOrUrl.startsWith('OL')) {
                    idOrOlidPrefix = 'olid';
                } else {
                    idOrOlidPrefix = 'id';
                }
            } else {
                return {
                    originalInput: olIdOrUrl,
                    status: 'failed',
                    reason: `Invalid imageType: ${imageType}`,
                    remoteImageUrl: undefined,
                    localPath: undefined
                };
            }
            remoteImageUrl = `https://covers.openlibrary.org/b/${idOrOlidPrefix}/${olIdOrUrl}-${size}.jpg`;
            baseFileName = `${olIdOrUrl}-${size}.jpg`;
        }

        outputPath = path.join(__dirname, '..', 'public', 'assets', 'images', imageType, baseFileName);
        storedURL = `/assets/images/${imageType}/${baseFileName}`;
        tempPath = `${outputPath}.tmp`;

        const outputDir = path.dirname(outputPath);
        await fsPromises.mkdir(outputDir, {
            recursive: true
        });

        try {
            await fsPromises.access(outputPath);
            return {
                originalInput: olIdOrUrl,
                status: 'cached',
                reason: 'Already exists locally',
                remoteImageUrl,
                localPath: storedURL
            };
        } catch (err) {
            // File does not exist locally, proceed to download
        }

        const response = await axios.get(remoteImageUrl, {
            responseType: 'stream',
            timeout: 15000
        });
        const writer = createWriteStream(tempPath);

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', async () => {
                try {
                    const stats = await fsPromises.stat(tempPath);
                    if (stats.size === 0) {
                        await fsPromises.unlink(tempPath).catch(() => {});
                        return reject(new Error('EMPTY_IMAGE_FILE'));
                    }
                    if (stats.size < 100) {
                        await fsPromises.unlink(tempPath).catch(() => {});
                        return reject(new Error('TOO_SMALL_IMAGE_FILE'));
                    }

                    await fsPromises.rename(tempPath, outputPath);
                    resolve();
                } catch (statErr) {
                    await fsPromises.unlink(tempPath).catch(() => {});
                    return reject(new Error(`Failed to verify downloaded image size: ${statErr.message}`));
                }
            });

            writer.on('error', async (err) => {
                await fsPromises.unlink(tempPath).catch(() => {});
                reject(new Error(`Failed to save image to temporary file: ${err.message}`));
            });
        });

        return {
            originalInput: olIdOrUrl,
            status: 'downloaded',
            reason: 'Successfully downloaded',
            remoteImageUrl,
            localPath: storedURL
        };

    } catch (error) {
        try {
            if (tempPath) {
                await fsPromises.unlink(tempPath);
            }
        } catch (cleanUpError) {
            // Ignore if file doesn't exist or other cleanup error during cleanup
        }

        let reason = `Unexpected error: ${error.message}`;
        let status = 'failed';
        if (axios.isAxiosError(error)) {
            if (error.response) {
                reason = `HTTP Error ${error.response.status}: ${error.response.statusText}`;
                if (error.response.status === 404) {
                    status = 'not_found';
                    reason = 'Image not found (404)';
                }
            } else if (error.request) {
                reason = 'No response from API (Network error or Timeout)';
            } else {
                reason = `Error setting up request: ${error.message}`;
            }
        } else if (error.message === 'EMPTY_IMAGE_FILE') {
            reason = 'Downloaded image file is empty';
        } else if (error.message === 'TOO_SMALL_IMAGE_FILE') {
            reason = 'Downloaded image file is too small';
        }

        return {
            originalInput: olIdOrUrl,
            status,
            reason,
            remoteImageUrl,
            localPath: undefined // Explicitly undefined for failures
        };
    }
}

/**
 * Fetches and stores Open Library images locally if not already present.
 * Can accept a single OL ID/URL or an array of OL IDs/URLs.
 * Provides a summarized console log output.
 *
 * @param {'author' | 'edition'} imageType - The type of image ('author' or 'edition').
 * @param {string | number | (string | number)[]} olIdOrUrls - A single Open Library ID/URL or an array of IDs/URLs.
 * @param {'S' | 'M' | 'L'} size - The desired image size ('S', 'M', 'L').
 * @returns {Promise<Object | Object[] | undefined>} - A detailed result object (for single input) or an array of detailed result objects (for array input). Returns undefined if input is empty.
 * Each result object includes: { originalInput, status, reason, remoteImageUrl, localPath }.
 */
export async function getOlImage(imageType, olIdOrUrls, size = 'M') {
    const isSingleInput = !Array.isArray(olIdOrUrls);
    const idsToProcess = isSingleInput ? [olIdOrUrls] : olIdOrUrls;
    const totalImages = idsToProcess.length;
    console.log(``);
    console.log('       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^');
    console.log(`       *^                   getOlImage                    ^*`);
    if (totalImages === 0) {

        console.log(`       > getOlImage: No images provided for type: ${imageType}.`);
        console.log(`       *^                End of getOlImage                ^*`);
        console.log('       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^');
        return isSingleInput ? undefined : [];
    }

    console.log(`       > getOlImage: Processing ${totalImages} images for type: ${imageType}...`);

    const BATCH_SIZE = 10;
    let results = [];

    for (let i = 0; i < idsToProcess.length; i += BATCH_SIZE) {
        const batch = idsToProcess.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
            batch.map(id =>
                retryWithDelay(() => _processSingleOlImage(imageType, id, size), 2, 300)
                .catch(err => {
                    // Return failure object if all retries fail
                    return {
                        originalInput: id,
                        status: 'failed',
                        reason: `Retry failed: ${err.message}`,
                        remoteImageUrl: undefined,
                        localPath: undefined
                    };
                })
            )
        );

        results = results.concat(batchResults);
    }

    const summary = {
        totalProcessed: totalImages,
        cached: 0,
        downloadedSuccessfully: 0,
        skipped: 0,
        notFound: 0,
        failed: {},
        exampleFailedInputs: {},
        exampleSkippedInputs: [],
    };

    results.forEach(res => {
        if (res.status === 'cached') {
            summary.cached++;
        } else if (res.status === 'downloaded') {
            summary.downloadedSuccessfully++;
        } else if (res.status === 'skipped') {
            summary.skipped++;
            if (summary.exampleSkippedInputs.length < 5) { // Limit examples to avoid massive logs
                summary.exampleSkippedInputs.push(res.originalInput);
            }
        } else if (res.status === 'not_found') {
            summary.notFound++;
            const reasonKey = 'Image not found (404)';
            summary.failed[reasonKey] = (summary.failed[reasonKey] || 0) + 1; // Count under 'failed' for 404
            if (!summary.exampleFailedInputs[reasonKey]) {
                summary.exampleFailedInputs[reasonKey] = res.originalInput;
            }
        } else if (res.status === 'failed') {
            // Use the specific reason from _processSingleOlImage
            const reasonKey = res.reason;
            summary.failed[reasonKey] = (summary.failed[reasonKey] || 0) + 1;
            if (!summary.exampleFailedInputs[reasonKey]) {
                summary.exampleFailedInputs[reasonKey] = res.originalInput;
            }
        }
    });

    console.log(`          getOlImage ${totalImages} images processing complete:`);
    console.log(`              ${summary.cached} images already cached`);
    console.log(`              ${summary.downloadedSuccessfully} images downloaded successfully`);
    if (summary.skipped > 0) {
        console.log(`              ${summary.skipped} images skipped due to invalid input. Example(s): ${summary.exampleSkippedInputs.join(', ')}`);
    }

    // Combine notFound and other failed reasons for a more detailed "failed" section
    const allFailedReasons = Object.keys(summary.failed);
    if (allFailedReasons.length > 0) {
        console.log(`              Failed image downloads:`);
        for (const reason in summary.failed) {
            console.log(`                  ${summary.failed[reason]} images failed because ${reason}. Example input: ${summary.exampleFailedInputs[reason]}`);
        }
    }
    console.log(``);
    console.log(`       *^                End of getOlImage                ^*`);
    console.log('       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^');

    // Return the full results array, or a single result object if input was single
    return isSingleInput ? results[0] : results;
}

async function retryWithDelay(fn, retries = 2, delayMs = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt <= retries) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    throw lastError;
}