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
export async function loginUser(req, res) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const {
        username,
        password
    } = req.body;

    try {
        let existingUser = await db.findUserPassword(username);

        if (existingUser && existingUser.status === "active") {
            if (await encryption.checkHashAgainstText(password, existingUser.encPassword)) {
                // Set session
                req.session.user = {
                    id: existingUser.userId,
                    username: username,
                    image: existingUser.image
                };
                req.session.isLoggedIn = true;
                return new Promise((resolve, reject) => {
                    req.session.save((err) => {
                        if (err) {
                            console.error('Error saving session after login:', err);
                            reject(new Error('Error saving session'));
                        }
                        console.log(`${ip}: User logged in: ${username}`);
                        resolve();
                    });
                });
            } else {
                const error = new Error(`Username and password do not match`);
                error.statusCode = 401;
                throw error;
            }
        } else if (existingUser && existingUser.status !== "active") {
            const error = new Error(`Username not active - please contact site admin`);
            error.statusCode = 401;
            throw error;
        } else {
            const error = new Error(`Username not found`);
            error.statusCode = 401;
            throw error;
        }
    } catch (error) {
        console.error(`${ip}: Login error: ${error.message} (Status: ${error.statusCode || 'N/A'})`);
        throw error;
    }
};