// This file is /utils/file-handler.js
import { promises as fsPromises } from 'fs';
import { createWriteStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function getOlImage(imageType, imageUrl) {
    console.log(`> getOlImage: Handling image: ${imageUrl}...`);
    if (!imageUrl) {
        console.warn(`   No image URL provided for type '${imageType}'. Skipping download.`);
        return undefined;
    }

    const basePath = path.join(__dirname, '/../public/assets/images/');
    const baseStoredURL = '/assets/images/';

    let imageSubDir;
    let openLibraryBaseUrl; // To store the appropriate Open Library base URL
    let filename; // Will be determined based on whether imageUrl is local or remote

    switch (imageType) {
        case 'author':
            imageSubDir = 'author';
            openLibraryBaseUrl = 'https://covers.openlibrary.org/a/id/';
            break;
        case 'edition':
            imageSubDir = 'edition';
            openLibraryBaseUrl = 'https://covers.openlibrary.org/b/olid/';
            break;
        default:
            throw new Error('- Invalid imageType. Must be "author" or "edition".');
    }

    const expectedLocalPrefix = baseStoredURL + imageSubDir + '/';
    let currentImageUrl = imageUrl; // Use a mutable variable for the URL to process

    // Handle local URLs and check for file existence
    if (currentImageUrl.startsWith(baseStoredURL)) {
        // Extract filename from the local path (e.g., "OL12345678M-L.jpg" or "9876543-M.jpg")
        filename = path.basename(currentImageUrl);
        const localFilePath = path.join(basePath, imageSubDir, filename);

        try {
            // Check if the local file actually exists on disk
            await fsPromises.access(localFilePath, fsPromises.constants.F_OK);
            console.log(`   ...getOlImage: File already downloaded: ${currentImageUrl}.`);
            return currentImageUrl; // File exists locally, return its path
        } catch (e) {
            // Local file does not exist, reconstruct the Open Library (remote) URL
            console.warn(`   getOlImage: Local file '${currentImageUrl}' not found. Downloading from Open Library.`);
            currentImageUrl = `${openLibraryBaseUrl}${filename}`;
        }
    } else {
        // If it's not a local path, assume it's a remote URL and proceed with parsing it
        try {
            const urlObj = new URL(currentImageUrl);
            // Decode URI component to handle special characters in filename if any
            filename = decodeURIComponent(path.basename(urlObj.pathname));
        } catch (e) {
            console.error(`   getOlImage: Invalid remote URL format provided: '${currentImageUrl}'. Error: ${e.message}`);
            throw new Error(`- Failed to process image due to invalid remote URL format: ${currentImageUrl}`);
        }
    }

    // At this point, currentImageUrl is either the original remote URL or a reconstructed remote URL
    // and filename has been correctly extracted for use in local file paths.

    const outputPath = path.join(basePath, imageSubDir, filename);
    const tempPath = outputPath + '.tmp'; // Use a temporary extension
    const storedURL = expectedLocalPrefix + filename; // Construct the full local URL for storage

    try {
        // 1. Ensure the target directory exists
        const dirPath = path.dirname(outputPath);
        await fsPromises.mkdir(dirPath, { recursive: true });

        // 2. Check if the FINAL file already exists (this check is secondary now, but good for race conditions)
        try {
            await fsPromises.access(outputPath, fsPromises.constants.F_OK);
            console.log(`   ...Image already exists locally (post-recheck): ${storedURL}`);
            return storedURL; // File exists, no need to download
        } catch (e) {
            // Final file does not exist, proceed to check/clean temp file and download
        }

        // Handle potential leftover temp files
        try {
            await fsPromises.access(tempPath, fsPromises.constants.F_OK);
            console.log(`   Found a leftover temp file for ${filename}, attempting to delete...`);
            await fsPromises.unlink(tempPath);
            console.log(`   Leftover temp file ${filename}.tmp deleted.`);
        } catch (e) {
            // No temp file found, or unable to delete (e.g., permissions), proceed
        }

        // 3. Fetch the image using axios
        const response = await axios({
            url: currentImageUrl, // Use currentImageUrl which might be the reconstructed remote URL
            method: 'GET',
            responseType: 'stream',
        });

        // Optional: Get expected content length for integrity check
        const contentLength = parseInt(response.headers['content-length'], 10);

        // 4. Create a writable stream to the TEMPORARY file
        const writer = createWriteStream(tempPath);
        let downloadedBytes = 0;

        response.data.on('data', (chunk) => {
            downloadedBytes += chunk.length;
        });

        await new Promise((resolve, reject) => {
            response.data.pipe(writer);

            writer.on('finish', async () => {
                // Final size check
                if (!isNaN(contentLength) && downloadedBytes !== contentLength) {
                    console.warn(`- Downloaded file size (${downloadedBytes} bytes) does not match Content-Length header (${contentLength} bytes) for ${currentImageUrl}.`);
                    await fsPromises.unlink(tempPath).catch(() => {});
                    return reject(new Error('Incomplete download based on Content-Length.'));
                }
                
                // Atomically rename the temporary file to the final path
                await fsPromises.rename(tempPath, outputPath);
                console.log('   ...Image successfully downloaded and stored:', storedURL);
                resolve();
            });

            writer.on('error', async (err) => {
                console.error('Error writing the temporary file:', err);
                await fsPromises.unlink(tempPath).catch(() => {});
                reject(new Error(`- Failed to save image to temporary file ${tempPath}: ${err.message}`));
            });
        });

        return storedURL; // Return the URL after successful download and rename

    } catch (error) {
        console.error(`- Error processing image from ${currentImageUrl} (${imageType}):`, error);
        throw new Error(`Failed to download or process image for ${imageType}.`);
    }
}