// This file is /utils/db-handler.js
import pg from 'pg';
import dotenv from 'dotenv';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

dotenv.config();

const db = new pg.Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DB,
    password: process.env.PG_PASS,
    port: parseInt(process.env.PG_PORT),
});

db.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

const PGStore = connectPgSimple(session);

export async function addUser(username, email, encPassword) {
    // Response:
    //     {
    //     "userId": [userId],
    //     "username": [username],
    //     "email": [email address]
    //     }
    // Throws an error on failure during database operations
    email = email.toLowerCase();
    try {
        let newUserResult= await db.query(
            'INSERT INTO users (username, email, enc_password, status) VALUES ($1, $2, $3, $4) RETURNING id AS "userId", username, email;',
            [username, email, encPassword, 'active']
        );

        return {
            userId: newUserResult.rows[0].userId,
            username: newUserResult.rows[0].username,
            email: newUserResult.rows[0].email
        };

    } catch (error) {
        await db.query('ROLLBACK'); // Rollback the transaction on error
        console.error('Error adding user and token:', error);
        error.statusCode = error.statusCode || 500; // Preserve existing status or default to 500
        throw error;
    }
}


export async function findUserPassword(username) {
    // Response:
    //     { 
    //     "userid": [userid], 
    //     "username": [username], 
    //     "encPassword": [encPassword]
    //     "status": [status]
    //     }
    // OR
    // Throws an error on failure
    try {
        const result = await db.query(
            'SELECT id AS "userId", username, enc_password AS "encPassword", status FROM users WHERE username = $1;',
            [username]
        );

        if (result.rows.length === 0) {
            const error = new Error(`User with username "${username}" not found.`);
            error.statusCode = 404; // Not Found
            throw error;
        }

        return result.rows[0];

    } catch (error) {
        error.statusCode = error.statusCode || 500; // Preserve existing status or default to 500
        throw error;
    }
}

export async function findUser(searchBy, searchItem) {
    // Response:
    //     { 
    //     "userId": [userid], 
    //     "username": [username], 
    //     "email": [email address],
    //     "status": [status]
    //     }
    // OR [] if no user
    // OR
    // Throws an error on failure

    try {
        let dbSearchBy;
        let query;
        let values = [searchItem];

        if (searchBy === "userId") {
            dbSearchBy = "u.id";
        } else if (searchBy === "username") {
            dbSearchBy = "u.username";
        } else if (searchBy === "email") {
            dbSearchBy = "u.email";
        } else {
            const error = new Error(`Invalid searchBy parameter: ${searchBy}`);
            error.statusCode = 400; // Bad Request
            console.error(error.message);
            throw error;
        }

        query = `
            SELECT u.id AS "userId", u.username, u.email, u.status
            FROM users u
            WHERE ${dbSearchBy} = $1;
        `;

        const result = await db.query(query, values);

        return result.rows[0];

    } catch (error) {
        console.error('Error finding user:', error);
        error.statusCode = error.statusCode || 500; // Preserve existing status or default to 500
        throw error;
    }
};

export {
    db,
    PGStore
};