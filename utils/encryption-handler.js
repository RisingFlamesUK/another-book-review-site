// encryption-handler.js

import crypto from "crypto";
import bcrypt from 'bcrypt'

//gemerate secret
export default function generateSecret() {

    // Generate a random 64-byte (512-bit) hex string
    const newSecret = crypto.randomBytes(64).toString('hex');
    return newSecret
}

//encrypt text
export async function encryptText(text) {
    try {
        const salt = await bcrypt.genSalt(parseInt(process.env.SALT_ROUNDS));
        const hash = await bcrypt.hash(text, salt);
        return hash;
    } catch (error) {
        console.error("Error encrypting text:", error);
        throw error;
    }
}

//check hash against text
export async function checkHashAgainstText(text, hash) {
    try {
        const result = await bcrypt.compare(text, hash);
        return result;
    } catch (error) {
        console.error("Error comparing text to hash:", error);
        return false;
    }
}