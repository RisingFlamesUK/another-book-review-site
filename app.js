// This file is app.js
//--------------Section for imports-----------------//
import express from "express";
import session from "express-session";
import generateSecret from "./utils/encryption-handler.js";
import dotenv from 'dotenv';
import {
    PGStore,
    db
} from './utils/db-handler.js';
import * as auth from './utils/auth-handler.js';
import rateLimit from 'express-rate-limit';
import * as utils from './utils/utils.js';
// import path from 'path';

dotenv.config();

const app = express();
const port = 3000;

const sessionSecret = process.env.SESSION_SECRET || generateSecret();


// app.use(express.static(path.join(__dirname, 'public')));
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
// REDIRECT to books || Fail send response

app.post("/signup", async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    try {
        const { username, password, email } = req.body;

        // Perform specific validation for signup
        const validationErrors = await utils.validateUser(username, password, email, true);
        console.log("Signup Validation Errors:", validationErrors); // <--- ADD THIS LINE
        if (validationErrors) {
            console.error(`${ip}: Failed to create user ${username} due to validation errors:`);
            const firstValidationError = validationErrors[0].message || 'Validation error occurred.';
            req.session.signupError = `Signup failed: ${firstValidationError}`;
            req.session.signupMode = 'signup';
            return req.session.save(() => res.redirect('/login-signup#signup'));
        }

        const user = await auth.createUser(username, email, password);
        console.log(`${ip}: New user created: ${username}`);

        if (user) {
            try {
                await auth.loginUser(req, res); // Corrected call: Passing only req and res
                return res.redirect('/books'); // Redirect on successful signup and login
            } catch (loginError) {
                console.error(`${ip}: Login failed immediately after signup for user: ${username}`, loginError);
                req.session.loginError = 'Signup successful, but automatic login failed. Please log in.';
                return req.session.save(() => res.redirect('/login-signup#login'));
            }
        } else {
            console.error(`${ip}: Failed to retrieve user data after signup: ${username}`);
            req.session.signupError = 'Signup successful, but user data retrieval failed.';
            req.session.signupMode = 'signup';
            return req.session.save(() => res.redirect('/login-signup#signup'));
        }

    } catch (error) {
        console.error(`${ip}: Failed to create user ${username} | `, error);
        req.session.signupError = error.message || `Failed to create user ${username}`;
        req.session.signupMode = 'signup';
        return req.session.save(() => res.redirect('/login-signup#signup'));
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
// REDIRECT to books || Fail send response
app.post('/login', async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    try {
        const { username, password } = req.body;

        // Perform specific validation using utils.validateUser
        const validationErrors = await utils.validateUser(username, password);
        if (validationErrors) {
            console.error(`${ip}: Failed to login ${username} due to validation errors:`);
            const firstValidationError = validationErrors[0].message || 'Validation error occurred.';
            req.session.loginError = `Login failed: ${firstValidationError}`;
            return req.session.save(() => res.redirect('/login-signup#login'));
        }

        // Check if the user is already logged in
        if (req.session.isLoggedIn) {
            console.log(`${ip}: User ${req.session.user.username} is already logged in. Destroying existing session.`);
            return req.session.destroy(async (err) => {
                if (err) {
                    console.error('Error destroying session:', err);
                    req.session.loginError = 'Error destroying previous session.';
                    return req.session.save(() => res.redirect('/login-signup#login'));
                }
                // Proceed with the new login attempt after successful logout
                try {
                    await auth.loginUser(req, res);
                    return res.redirect('/books'); // Redirect on successful login
                } catch (loginError) {
                    req.session.loginError = loginError.message || 'Login failed.';
                    return req.session.save(() => res.redirect('/login-signup#login'));
                }
            });
        } else {
            // If not logged in, proceed with login
            try {
                await auth.loginUser(req, res);
                return res.redirect('/books'); // Redirect on successful login
            } catch (loginError) {
                req.session.loginError = loginError.message || 'Login failed.';
                return req.session.save(() => res.redirect('/login-signup#login'));
            }
        }

    } catch (error) {
        console.error(`${ip}: Login error in route handler:`, error);
        req.session.loginError = error.message || 'Login failed due to an internal error.';
        return req.session.save(() => res.redirect('/login-signup#login'));
    }
});

//-------------------------------------
// 3.	User Logout: GET /logout route 
//-------------------------------------
// Response: 
// REDIRECT to books
app.get('/logout', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (req.session.isLoggedIn) {
        let username = (req.session.user.username);

        req.session.destroy((err) => {
            if (err) {
                console.error(`${ip}: Error destroying session:`, err);
                return res.status(500).send('Error during logout');
            }
            console.log(`${ip}: User logout: ${username}`);
            res.redirect('/');
        });
    } else {
        res.redirect('/books');
    }
});

//-------------------------------------
//     **** Web Pages ****
//-------------------------------------

app.get('/', (req, res) => {
    if (req.session.isLoggedIn) {
        res.redirect('/books');
    } else {
        res.render("index.ejs")
    }
});


app.get('/books', (req, res) => {
    if (req.session.isLoggedIn) {
        //change to res.render
        res.send(`Welcome to the books review section, ${req.session.user.username}!`);
    } else {
        res.redirect('/');
    }
});

app.get('/login-signup', (req, res) => {

    if (req.session.isLoggedIn) {
        return res.redirect('/books');
    }
    const loginError = req.session.loginError;
    delete req.session.loginError;
    const signupError = req.session.signupError;
    delete req.session.signupError;
    const isLoggedIn = req.session.isLoggedIn || false;
    const initialTab = req.session.signupMode || 'login';

    res.render('login-signup.ejs', {
        activeTab: initialTab,
        isLoggedIn: isLoggedIn,
        loginError: loginError,
        signupError: signupError,
    });
    delete req.session.signupMode;

});

app.get('/login', (req, res) => {
    req.session.signupMode = 'login';
    req.session.save(() => {
        res.redirect('/login-signup');
    });
});

app.get('/signup', (req, res) => {
    req.session.signupMode = 'signup';
    req.session.save(() => {
        res.redirect('/login-signup');
    });
});
app.listen(port, () => {
    console.clear();
    console.log("Console was cleared.... newly running server to follow");
    console.log("------------------------------------------------------");
    console.log(`Server running on port ${port}`);
    console.log("------------------------------------------------------");
    console.log("");
});