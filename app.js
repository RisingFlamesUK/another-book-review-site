// This file is app.js
//--------------Section for imports-----------------//
import express from "express";
import session from "express-session";
import {
    database,
    PGStore
} from './utils/database.js';
import {
    initDbAndCache,
    cachedStatuses,
    cachedSubjects,
    cachedOlids,
    cachedLanguages,
    cachedTrending,
    cachedBrowseSubjects,
    getUserBooks,
    setUserScore,
    getWorkScore,
    getUserReviews,
    logCurrentCache,
} from './utils/db-handler.js';
import generateSecret from "./utils/encryption-handler.js";
import dotenv from 'dotenv';
import * as auth from './utils/auth-handler.js';
import rateLimit from 'express-rate-limit';
import * as utils from './utils/utils.js';
import * as ol from './utils/ol-handler.js';
import * as ejsHelpers from './utils/ejs-helpers.js';
import * as be from './utils/backend-data-handler.js'

dotenv.config();

console.clear();
console.log("******************************************************");
console.log("Console was cleared.... newly running server to follow");
console.log("******************************************************");

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
            pool: database,
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

// --- START: Initialise DB and Cache ---
let subjects = [
    'Fiction',
    'Non-Fiction'
]
let subjectLanguage = 'eng'
let subjectReelLength = 20; // need enough to feed the reel.

try {
    await initDbAndCache(subjects, subjectLanguage, subjectReelLength); // Initialize DB connection and cache data
    console.log('   Cached Statuses:', cachedStatuses.length > 0 ? cachedStatuses.length : 'empty');
    console.log('   Cached Subjects:', cachedSubjects.size > 0 ? cachedSubjects.size : 'empty');
    const totalOlids = cachedOlids.editions.size + cachedOlids.works.size + cachedOlids.authors.size;
    console.log('   Cached Olids:', totalOlids > 0 ? totalOlids : 'empty');
    console.log('   Cached Langages:', cachedLanguages.size > 0 ? cachedLanguages.size : 'empty');
    console.log('   Cached Trending:', cachedTrending && cachedTrending.data && cachedTrending.data.length > 0 ?
        cachedTrending.data.length : 'empty');
    console.log('   Cached Browse Subjects:');
    for (const subjectName in cachedBrowseSubjects) {
        if (Object.hasOwnProperty.call(cachedBrowseSubjects, subjectName)) {
            const subjectCache = cachedBrowseSubjects[subjectName];
            // Ensure subjectCache.data exists and is an array before trying to get its length
            const dataCount = subjectCache && Array.isArray(subjectCache.data) ? subjectCache.data.length : 0;
            console.log(`      ${subjectName}: `,dataCount);
        }
    }

} catch (error) {
    console.error('***Server failed to start due to database/cache initialization error:', error, "***");
    process.exit(1); // Exit process if critical initialization fails
}
// --- END: Initialise DB and Cache ---


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
        const {
            username,
            password,
            email
        } = req.body;

        // Perform specific validation for signup
        const validationErrors = await utils.validateUser(username, password, email, true);

        if (validationErrors) {
            const validationsErrorMessages = await validationErrors.map((error) => {
                return error.message;
            });
            const firstValidationError = validationErrors[0].message || 'Validation error occurred.';
            console.error(`${ip}: Failed to create user ${username} due to validation errors:\n`, validationsErrorMessages);
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
        const {
            username,
            password
        } = req.body;

        // Perform specific validation using utils.validateUser
        const validationErrors = await utils.validateUser(username, password);
        if (validationErrors) {
            const validationsErrorMessages = await validationErrors.map((error) => {
                return error.message;
            });
            const firstValidationError = validationErrors[0].message || 'Validation error occurred.';
            console.error(`${ip}: Failed to login ${username} due to validation errors:\n`, validationsErrorMessages);
            req.session.loginError = `Login failed: ${firstValidationError}`;
            return req.session.save(() => res.redirect('/login-signup#login'));
        }

        // Check if the user is already logged in
        if (req.session.isLoggedIn) {
            console.log(`${ip}: User ${req.session.user.username} is already logged in. Regenerating session.`);
            req.session.regenerate(async (err) => {
                if (err) {
                    console.error('Error regenerating session:', err);
                    return res.status(500).send('Failed to create new session');
                }

                // Proceed with the new login attempt after successful regeneration
                try {
                    await auth.loginUser(req, res);
                    return res.redirect('/books'); // Redirect on successful login
                } catch (loginError) {
                    console.error("Error during new login after regenerate:", loginError);
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
        res.redirect('/');
    }
});

//-------------------------------------
//     **** Web Pages ****
//-------------------------------------


//-------------------------------------
// 1.	Home page - not logged in 
//-------------------------------------
// redirects to /books when logged in
app.get('/', (req, res) => {
    if (req.session.isLoggedIn) {
        res.redirect('/books');
    } else {
        res.render("./index.ejs")
    }
});

//-------------------------------------
// 2.	Books page - user dashboard 
//-------------------------------------
app.get('/books', async (req, res) => {
    if (req.session.isLoggedIn) {
        let user = {
            user_id: req.session.user.id,
            username: req.session.user.username,
            image: req.session.user.image
        };
        let cards = await getUserBooks(user.user_id);

        res.render("my-books.ejs", {
            user,
            cards,
            cachedStatuses: cachedStatuses,
            processScore: ejsHelpers.processScore,
            scoreToStars: ejsHelpers.scoreToStars,
            processUserScore: ejsHelpers.processUserScore,
            processAuthors: ejsHelpers.processAuthors,
            processDescription: ejsHelpers.processDescription,
            toTitleCase: ejsHelpers.toTitleCase,
        })
    } else {
        res.redirect('/');
    }
});

//-------------------------------------
// 3.	Login/signup page
//-------------------------------------
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
    if (req.session.isLoggedIn) {
        res.redirect('/books');
    } else {
        req.session.signupMode = 'login';
        req.session.save(() => {
            res.redirect('/login-signup');
        });
    };
});

app.get('/signup', (req, res) => {
    if (req.session.isLoggedIn) {
        res.redirect('/books');
    } else {
        req.session.signupMode = 'signup';
        req.session.save(() => {
            res.redirect('/login-signup');
        });
    };
});
//-------------------------------------
// 4.	View Edition
//-------------------------------------
app.post('/edition', async (req, res) => {
    const cardData = req.body;
    let user = undefined;

    try {
        if (cardData.description) {
            cardData.description = JSON.parse(cardData.description);
        }
        if (cardData.authors) {
            cardData.authors = JSON.parse(cardData.authors);
        }
        if (req.session.isLoggedIn) {
            user = req.session.user;
            let result = await getUserReviews(user.id, cardData?.edition_olid);
            cardData.userReview = result[0];
        } else {
            cardData.userReview = null;
        }

        cardData.workScore = await getWorkScore(cardData.work_olid);

        if (cardData.workScore?.work_olid.length === 0) {
            cardData.workScore = null;
        }

    } catch (e) {
        console.error("Error parsing JSON data from submitted card:", e);
        return res.status(400).send("Invalid data format received.");
    }

    // console.log("Received card data on /edition POST:", cardData);

    res.render('edition.ejs', {
        user: user,
        edition: cardData,
        cachedStatuses: cachedStatuses,
        processUserScore: ejsHelpers.processUserScore,
        processScore: ejsHelpers.processScore,
        scoreToStars: ejsHelpers.scoreToStars,
        processAuthors: ejsHelpers.processAuthors,
        processDescription: ejsHelpers.processDescription,
        toTitleCase: ejsHelpers.toTitleCase,
    });
});

//-------------------------------------
// 5.	Browse Books 
//      (incl add to collection)
//-------------------------------------
app.get('/browse', async (req, res) => {
    let user = undefined;
    if (req.session.isLoggedIn) {
        user = {
            user_id: req.session.user.id,
            username: req.session.user.username,
            image: req.session.user.image
        };
    }

    let cards = {};
    if (cachedTrending && cachedTrending.data && cachedTrending.data.length > 0) {
        cards.trending = cachedTrending.data;
    } else {
        cards.trending = []
    }
    cards.browseSubjects = cachedBrowseSubjects;

    res.render('browse-books.ejs', {
        user: user,
        cards: cards,

    })

});

//-------------------------------------
//     **** Data handling ****
//-------------------------------------
// TESTS fo OL API interactions
app.get('/search', async (req, res) => {
    const criteria = req.query.criteria;
    const type = req.query.type;
    const page = req.query?.page || 1;
    const language = req.query?.language || undefined;

    try {
        const response = await ol.getOlData(type, criteria, page, language);
        // If getOlData returns null for no results, send 404 or empty response
        if (response === null) {
            return res.status(404).json({
                message: `No data found for ${type} with criteria: ${criteria}`
            });
        }
        return res.json(response);
    } catch (error) {
        console.error('Error fetching data from Open Library for search:', error.message);
        // Use error.statusCode if available, otherwise default to 500
        res.status(error.statusCode || 500).json({
            error: error.message || 'Failed to fetch book data from Open Library'
        });
    }
});

//-------------------------------------
// 1. POST a user selected edition 
//-------------------------------------
app.post('/add-edition', async (req, res) => {
    if (!req.session.isLoggedIn || !req.session.user?.id) {
        console.error(`Not Authorised to Add Books: User not logged in or user ID missing`);
        return res.status(401).json({
            error: 'Not Authorised to Add Books: User not logged in'
        });
    }

    const user_id = req.session.user.id;
    const edition_olid = req.query.edition_olid;
    let authors = req.query.authors;

    if (!edition_olid) {
        return res.status(400).json({
            error: 'Edition OLID is required.'
        });
    }

    try {
        // Parse the authors string into a JavaScript array
        if (authors) {
            try {
                authors = JSON.parse(authors);
                if (!Array.isArray(authors)) {
                    console.error("Error: authors query parameter was not a valid JSON array.");
                    return res.status(400).json({
                        error: 'Invalid authors format: not an array.'
                    });
                }
            } catch (error) {
                console.error("Error parsing authors query parameter:", error.message);
                return res.status(400).json({
                    error: 'Invalid authors format: invalid JSON.'
                });
            }
        } else {
            authors = []; // If no authors provided, default to an empty array
        }

        const response = await be.selectedEdition(user_id, edition_olid, authors, true);
        return res.status(200).json({
            message: response
        });
    } catch (error) {
        console.error(`Error in /edition route for user ${user_id}, edition ${edition_olid}:`, error.message);
        // Use error.statusCode from custom errors or default to 500
        res.status(error.statusCode || 500).json({
            error: error.message || 'Failed to process selected edition.'
        });
    }
});
//-------------------------------------
// 2. POST a user score 
//-------------------------------------
app.post('/set-user-score', async (req, res) => {
    // Ensure user is logged in
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({
            success: false,
            message: 'You must be logged in to set a score.'
        });
    }

    const {
        edition_olid,
        work_olid,
        score
    } = req.body;
    const user_id = req.session.user.id;

    // Basic validation
    if (!edition_olid || !work_olid || score === undefined || score < 1 || score > 5) {
        return res.status(400).json({
            success: false,
            message: 'Invalid rating data provided.'
        });
    }

    try {
        const result = await setUserScore(user_id, edition_olid, work_olid, score);

        if (result.newUserScore === score) {

            res.json({
                success: true,
                message: 'Rating updated successfully.',
                newUserScore: result.newUserScore,
                newWorkScore: result.newWorkScore ? result.newWorkScore : null,
                newWorkReviewCount: result.newWorkReviewCount ? result.newWorkReviewCount : null
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to update rating in database.'
            });
        }
    } catch (error) {
        console.error('Error in /set-user-score route:', error);
        res.status(500).json({
            success: false,
            message: 'An internal server error occurred.'
        });
    }
});

// This middleware will be executed if no other route has matched the request.
app.use((req, res, next) => {
    res.status(404).send("Sorry, the page you're looking for doesn't exist!");
});

app.listen(port, () => {
    console.log("------------------------------------------------------");
    console.log(`Server running on port ${port}`);
    console.log("------------------------------------------------------");
    // logCurrentCache();
    console.log("");

});