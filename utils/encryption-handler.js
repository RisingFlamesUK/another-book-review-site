// encryption-handler.js

import crypto from "crypto";

//gemerate secret
export default function generateSecret() {

    // Generate a random 64-byte (512-bit) hex string
    const newSecret = crypto.randomBytes(64).toString('hex');
    return newSecret
}

//encrypt file

//decrypt file