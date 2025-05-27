// This file is app.js
//--------------Section for imports-----------------//
import express from "express";
import session from "express-session";
import generateSecret from "./utils/encryption-handler.js";
import dotenv from 'dotenv';
import {
    PGStore,
    db
} from './utils/db-handler.js'
import * as auth from './utils/auth-handler.js'
import rateLimit from 'express-rate-limit';
import * as utils from './utils/utils.js'

dotenv.config();

const app = express();
const port = 3000;

const sessionSecret = process.env.SESSION_SECRET || generateSecret();


app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({
    extended: false
}));

app.use(
    session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,

        store: new PGStore({
            pool: db,
            tableName: 'session',
        }),
        cookie: {
            secure: false, // Set to true in production if using HTTPS
            path: '/',
            httpOnly: true
        }
    })
);

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(limiter);

//--------------------------------//
//           ROUTES
//--------------------------------//


//-------------------------------------
//     **** USER MANAGEMT ****
//-------------------------------------

//-------------------------------------
// 1.	User Sign-up: POST /users route 
//-------------------------------------
// Request: 
// { 
//  "username": "johnDoe", 
//  "email": "johndoe@example.com", 
//  "password": "password123" 
// } 

// Response: 
// REDIRECT to dashboard || Fail send resposne

app.post("/newUser", async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!req.body) {
        return res.status(400).json({
            error: 'Validation error',
            details: [{
                field: 'body',
                message: 'Request body is missing'
            }]
        });
    }

    if (!req.body.username) {
        return res.status(400).json({
            error: 'Validation error',
            details: [{
                field: 'username',
                message: 'Username is required'
            }]
        });
    }

    if (!req.body.password) {
        return res.status(400).json({
            error: 'Validation error',
            details: [{
                field: 'password',
                message: 'Password is required'
            }]
        });
    }

    if (!req.body.email) {
        return res.status(400).json({
            error: 'Validation error',
            details: [{
                field: 'email',
                message: 'email is required'
            }]
        });
    }
    const {
        username,
        password,
        email
    } = req.body;

    try {
        const validationErrors = await utils.validateUser(username, password, email, true);
        if (validationErrors) {
            console.error(`${ip}: Failed to create user ${username} due to validation errors:`);
            validationErrors.forEach(error => {
                console.error(`  Field: ${error.field}, Message: ${error.message}`);
            });
            return res.status(400).json({
                error: 'Failed to create user due to validation errors',
                details: validationErrors
            });
        }

        const user = await auth.createUser(username, email, password);
        console.log(`${ip}: New user created: ${username}`);
        res.json(user);
    } catch (error) {
        console.error(`${ip}: Failed to create user ${username} | `, error);

        const statusCode = error.statusCode || 500;
        const message = error.message || `Failed to create user ${username}`;
        const errors = error.details || [];
        res.status(statusCode).json({
            error: message,
            details: errors
        });
    }
});


//-------------------------------------
// 2.	User Login: POST /login route 
//-------------------------------------
// Request:
// { 
//  "username": "johnDoe", 
//  "password": "password123" 
// } 

// Response: 
// REDIRECT to dashboard || Fail send resposne
app.post('/login', async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (!req.body) {
        return res.status(400).json({
            error: 'Validation error',
            details: [{
                field: 'body',
                message: 'Request body is missing'
            }]
        });
    }

    if (!req.body.username) {
        return res.status(400).json({
            error: 'Validation error',
            details: [{
                field: 'username',
                message: 'Username is required'
            }]
        });
    }

    if (!req.body.password) {
        return res.status(400).json({
            error: 'Validation error',
            details: [{
                field: 'password',
                message: 'Password is required'
            }]
        });
    }
    const {
        username,
        password
    } = req.body;

    try {
        const validationErrors = await utils.validateUser(username, password);
        if (validationErrors) {
            console.error(`${ip}: Failed to login ${username} due to validation errors:`);
            validationErrors.forEach(error => {
                console.error(`  Field: ${error.field}, Message: ${error.message}`);
            });
            return res.status(400).json({
                error: 'Failed to login due to validation errors',
                details: validationErrors
            });
        }

        const authenticatedUser = await auth.loginUser(username, password);
        if (authenticatedUser) {
            req.session.user = {
                id: authenticatedUser.userID,
                username: username
            };
            req.session.isLoggedIn = true;
            req.session.save((err) => {
                if (err) {
                    console.error('Error saving session:', err);
                    return res.status(500).send('Error saving session');
                }

                console.log(`${ip}: User login: ${username}`);
                res.redirect('/dashboard');
            });
        } else {
            res.status(401).send('Authentication failed');
        }
    } catch (error) {
        console.error(`${ip}: Login error:`, error);
        res.status(error.statusCode || 500).send(error.message || 'Login failed');
    }
});

app.get('/dashboard', (req, res) => {
    if (req.session.isLoggedIn) {
        res.send(`Welcome to the dashboard, ${req.session.user.username}!`);
    } else {
        res.redirect('/login');
    }
});

app.get('/logout', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (req.session.user) {
        let username = (req.session.user.username);

        req.session.destroy((err) => {
            if (err) {
                console.error(`${ip}: Error destroying session:`, err);
                return res.status(500).send('Error during logout');
            }
            console.log(`${ip}: User logout: ${username}`);
            res.redirect('/dashboard');
        });
    } else {
        res.redirect('/dashboard');
    }
});




app.listen(port, () => {
    console.clear();
    console.log("Console was cleared.... newly running server to follow");
    console.log("------------------------------------------------------");
    console.log(`Server running on port ${port}`);
    console.log("------------------------------------------------------");
    console.log("");
});