// auth-handler.js

import * as encryption from './encryption-handler.js';
import * as db from './db-handler.js'

// Create user
export async function createUser(username, email, password) {

    //****toDo: Google tokens
    //****toDo: Facebook tokens
    try {
        const encPassword = await encryption.encryptText(password);
        const UserByUsername = await db.addUser(username, email, encPassword);

        const response = {
            "userId": UserByUsername.userId,
            "username": UserByUsername.username,
            "email": UserByUsername.email,
        };
        
        return response;
    } catch (error) {
        // Re-throw the error to be caught in app.js
        throw error;
    };
};

/// login
export async function loginUser(username, password) {
    try {
        let existingUser = await db.findUserPassword(username);

        if (existingUser && existingUser.status == "active") {
            //check password against the password hash stored
            if (await encryption.checkHashAgainstText(password, existingUser.encPassword)) {

                const response = {
                    "userID": existingUser.userId,
                };
                return response;
            } else {
                // Throw an error if the user and password dont match
                const error = new Error(`Username and password do not match`);
                error.statusCode = 401; // HTTP status code (Unauthorized)
                throw error;
            };
        } else {
            // Throw an error if the username was not found
            const error = new Error(`Username not found`);
            error.statusCode = 401; // HTTP status code (Unauthorized)
            throw error;
        }
    } catch (error) {
        // Re-throw the error to be caught in app.js
        throw error;
    };
};