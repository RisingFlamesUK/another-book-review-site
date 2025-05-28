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
    if (!req.body) {
        const error = new Error('Request body is missing.');
        error.statusCode = 400;
        throw error;
    }
    if (!req.body.username) {
        const error = new Error('Username is required.');
        error.statusCode = 400;
        throw error;
    }
    if (!req.body.password) {
        const error = new Error('Password is required.');
        error.statusCode = 400;
        throw error;
    }
    
    const { username, password } = req.body;

    try {
        let existingUser = await db.findUserPassword(username);

        if (existingUser && existingUser.status === "active") {
            if (await encryption.checkHashAgainstText(password, existingUser.encPassword)) {
                // Set session
                req.session.user = { id: existingUser.userId, username: username };
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
        } else {
            const error = new Error(`Username not found`);
            error.statusCode = 401;
            throw error;
        }
    } catch (error) {
        console.error(`${ip}: Login error in loginUser:`, error);
        throw error;
    }
};

