// This file is app.js
//--------------Section for imports-----------------//
import express from "express";
import session from "express-session";
import {
    database,
    PGStore
} from './utils/database.js';
import * as file from "./utils/file-handler.js"
import {
    initDbAndCache,
    cachedStatuses,
    cachedSubjects,
    cachedOlids,
    cachedLanguages,
    cachedTrending,
    cachedBrowseSubjects,
    getUserBooks,
    putUserScore,
    getWorksScore,
    getUserReviews,
    putUserReview,
    patchUserReview,
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
import {
    validateBody
} from './middleware/validateBody.js';
import {
    validateQuery
} from './middleware/validateQuery.js';

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
    max: 250, // Limit each IP to 100 requests per windowMs
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
            console.log(`      ${subjectName}: `, dataCount);
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
// REDIRECT to referrer page || books 

app.post("/signup", validateBody(['username', 'email', 'password']), auth.handleSignup);

//-------------------------------------
// 2.	User Login: POST /login route 
//-------------------------------------
// Request:
// { 
//  "username": "johnDoe", 
//  "password": "password123" 
// } 

// Response: 
// REDIRECT to referrer page || books 
app.post("/login", validateBody(['username', 'password']), auth.handleLogin);

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
// 2.	My Books page - user dashboard 
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
    // console.log('DEBUG: followed the app.get /login-signup route')
    if (req.session.isLoggedIn) {
        // If already logged in, redirect to the stored returnTo path or default
        const returnTo = req.session.returnTo || '/books';
        delete req.session.returnTo; // Clean up the session after using it
        return res.redirect(returnTo);
    }

    const returnTo = req.query.returnTo || utils.getReturnToUrl(req) || '/';
    req.session.returnTo = returnTo;

    res.render('login-signup.ejs', {
        activeTab: req.session.signupMode || 'login',
        isLoggedIn: req.session.isLoggedIn || false,
        loginError: req.session.loginError,
        signupError: req.session.signupError,
        returnTo: returnTo // Pass returnTo to the EJS template
    });
    delete req.session.signupMode; // Clear signup mode from session
    delete req.session.loginError; // Clear error from session after displaying
    delete req.session.signupError; // Clear error from session after displaying
});

app.get('/login', (req, res) => {
    // console.log('DEBUG: followed the app.get /login route')
    if (req.session.isLoggedIn) {
        const returnTo = req.session.returnTo || '/books';
        delete req.session.returnTo;
        return res.redirect(returnTo);
    } else {
        req.session.signupMode = 'login';
        req.session.returnTo = utils.getReturnToUrl(req);
        req.session.save(() => {
            res.redirect('/login-signup#login');
        });
    }
});

app.get('/signup', (req, res) => {
    // console.log('DEBUG: followed the app.get /signup route')
    if (req.session.isLoggedIn) {
        const returnTo = req.session.returnTo || '/books';
        delete req.session.returnTo;
        return res.redirect(returnTo);
    } else {
        req.session.signupMode = 'signup';
        req.session.returnTo = utils.getReturnToUrl(req);
        req.session.save(() => {
            res.redirect('/login-signup#signup');
        });
    }
});

//-------------------------------------
// 4.	View Edition
//-------------------------------------
// From Work page or direct navigation
app.get('/edition/:edition_olid', async (req, res) => {
    let cardData = null;
    let user = undefined;
    let user_id;
    const edition_olid = req.params.edition_olid;

    if (req.session.isLoggedIn) {
        user = {
            username: req.session.user.username,
            image: req.session.user.image
        };
        user_id = req.session.user.id
    }

    try {
        cardData = await be.getEditionCardData(edition_olid, 'all', user_id);

    } catch (error) {
        console.error(`Error retrieving data for edition: ${edition_olid}:`, error);
        return res.status(400).send(`Error retrieving data for edition: ${edition_olid}`);
    }

    // console.log("DEBUG Received card data on /edition GET:", cardData);

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

//render a review partial
app.get('/render-partial/user-review', validateQuery(['edition_olid', 'work_olid']), async (req, res) => {
    const user = req.session?.user;
    const edition_olid = req.query.edition_olid;
    const work_olid = req.query.work_olid;

    if (!user || !user.id) {
        return res.status(401).send('Unauthorized');
    }

    try {
        const books = await getUserBooks(user.id, edition_olid);
        if (!books || books.length === 0) {
            return res.status(404).send('Review not found');
        }

        const book = books[0];
        const reviewData = book.userReview;

        if (!reviewData) {
            return res.status(404).send('Review not found');
        }

        // console.log('DEBUG: app.get /rendrer-partial/user-review route, reviewData ', reviewData)

        res.render('partials/review.ejs', {
            'reviewData': {
                edition_olid: reviewData.edition_olid,
                username: user.username,
                user_image: user.image,
                review_id: reviewData.review_id,
                review_title: reviewData.userreviewtitle,
                review: reviewData.userreview,
                score: reviewData.userscore,
                created: reviewData.userreviewcreated,
                last_modified: reviewData.userreviewmodified,
            },
            isUserReview: true,
            username: user.username,
            userImage: user.image,
            edition: {
                edition_olid,
                work_olid
            },
            processUserScore: ejsHelpers.processUserScore,
            processScore: ejsHelpers.processScore,
            scoreToStars: ejsHelpers.scoreToStars,
            processAuthors: ejsHelpers.processAuthors,
            processDescription: ejsHelpers.processDescription,
            toTitleCase: ejsHelpers.toTitleCase,
        });

    } catch (err) {
        console.error('Error rendering user review partial:', err);
        res.status(500).send('Internal server error');
    }
});


//render the review form partial
app.post('/render-partial/review-form', validateBody(['initialTitle', 'initialReview', 'initialScore'], {
    optional: ['reviewId']
}), async (req, res) => {
    const {
        reviewId,
        initialTitle,
        initialReview,
        initialScore
    } = req.body;

    try {
        return res.render('partials/review-form.ejs', {
            reviewId,
            initialTitle,
            initialReview,
            initialScore
        });
    } catch (err) {
        console.error('Render partial error:', err);
        return res.status(500).json({
            error: err.message
        });
    }
});

//-------------------------------------
// 5.  Browse Books
//-------------------------------------
app.get('/browse', async (req, res) => {
    // console.log('DEBUG: followed the app.get /browse route')
    let user = undefined;
    if (req.session.isLoggedIn) {
        user = {
            user_id: req.session.user.id,
            username: req.session.user.username,
            image: req.session.user.image
        };
    }

    let cards = {};
    cards.trending = cachedTrending && cachedTrending.data && cachedTrending.data.length > 0 ? cachedTrending.data : [];
    cards.browseSubjects = cachedBrowseSubjects || {}; // Ensure it's an object, even if empty

    const allWorkOlids = new Set(); // Use a Set to store unique work_olids

    // Collect work_olids from trending data
    cards.trending.forEach(item => {
        if (item.work_olid) {
            allWorkOlids.add(item.work_olid);
        }
    });

    // Collect work_olids from browse subjects data
    for (const subject in cards.browseSubjects) {
        if (Object.prototype.hasOwnProperty.call(cards.browseSubjects, subject)) {
            const subjectDataWrapper = cards.browseSubjects[subject]; // This is the { data: [], lastUpdate: ... } object

            // Check if subjectDataWrapper exists and has a 'data' property that is an array
            if (subjectDataWrapper && Array.isArray(subjectDataWrapper.data)) {
                subjectDataWrapper.data.forEach(item => {
                    if (item && item.work_olid) {
                        allWorkOlids.add(item.work_olid);
                    }
                });
            } else {
                console.warn(`Warning: cards.browseSubjects['${subject}'] does not contain a valid 'data' array. Skipping.`);
            }
        }
    }

    // Convert Set to Array for getWorksScore
    const uniqueWorkOlidsArray = Array.from(allWorkOlids);

    let workScoresMap = new Map();
    if (uniqueWorkOlidsArray.length > 0) {
        try {
            const fetchedWorkScores = await getWorksScore(uniqueWorkOlidsArray);
            // Map the fetched scores for easy lookup by work_olid
            fetchedWorkScores.forEach(score => {
                // Store just the averageScore
                workScoresMap.set(score.work_olid, score.averageScore);
            });
        } catch (error) {
            console.error("Error fetching work scores for browse page:", error);
            // Log it and proceed, letting workScore remain undefined/null where not found
        }
    }

    // Attach work scores to trending data
    cards.trending.forEach(item => {
        if (item.work_olid) {
            item.averageScore = workScoresMap.get(item.work_olid) || null; // Add averageScore, or null if not found
        } else {
            item.averageScore = null; // Ensure it's null if work_olid is missing
        }
    });

    // Attach work scores to browse subjects data
    for (const subject in cards.browseSubjects) {
        if (Object.prototype.hasOwnProperty.call(cards.browseSubjects, subject)) {
            const subjectDataWrapper = cards.browseSubjects[subject]; // This is the { data: [], lastUpdate: ... } object

            // Check if subjectDataWrapper exists and has a 'data' property that is an array
            if (subjectDataWrapper && Array.isArray(subjectDataWrapper.data)) {
                subjectDataWrapper.data.forEach(item => { // Now correctly accessing the 'data' array
                    if (item && item.work_olid) {
                        item.averageScore = workScoresMap.get(item.work_olid) || null; // Add averageScore, or null if not found
                    } else if (item) { // If item exists but work_olid is missing
                        item.averageScore = null; // Ensure it's null
                    }
                });
            }
        }
    }

    res.render('browse-books.ejs', {
        user: user,
        cards: cards,
        scoreToStars: ejsHelpers.scoreToStars,
    });
});

//-------------------------------------
// 6.	View Works 
//      (incl add to collection)
//-------------------------------------
app.get('/works/prepare/:work_olid', (req, res) => {

    const work_olid = req.params.work_olid;
    // console.log('DEBUG: followed the app.get /works/prepare/:work_olid route for:', work_olid)
    const initial_cover_url = req.query.cover_url ? decodeURIComponent(req.query.cover_url) : null;

    let returnToUrl = req.query.returnTo || req.session.returnTo || utils.getReturnToUrl(req);
    // console.log('DEBUG: /works/prepare returnTo:', returnToUrl)

    if (initial_cover_url) {
        // Store the cover_url in the user's session
        req.session.initialCoverUrls = req.session.initialCoverUrls || {};
        req.session.initialCoverUrls[work_olid] = initial_cover_url;
        setTimeout(() => delete req.session.initialCoverUrls[work_olid], 60000);

    }

    // Redirect to the clean URL
    res.redirect(`/works/${work_olid}`);
});

app.get('/works/:work_olid', async (req, res) => {
    const work_olid = req.params.work_olid;
    // console.log('DEBUG: followed the app.get /works/prepare/:work_olid route for:', work_olid)
    // let returnToUrl = req.query.returnTo || req.session.returnTo || utils.getReturnToUrl(req);
    // console.log('DEBUG: /works returnTo:', returnToUrl)

    let user = undefined;
    if (req.session.isLoggedIn) {
        user = {
            user_id: req.session.user.id,
            username: req.session.user.username,
            image: req.session.user.image
        };
    }

    // console.log('DEBUG: work_olid in route just before calling getWorkCardData:', work_olid);

    let card = {};
    card = await be.getWorkCardData(work_olid, user?.user_id);

    // Get the initial cover URL from the session, if it exists for this work_olid
    const sessionCoverUrl = (req.session.initialCoverUrls && req.session.initialCoverUrls[work_olid]) ?
        req.session.initialCoverUrls[work_olid] :
        null;

    // IMPORTANT: Clear the session data immediately after retrieving it
    if (req.session.initialCoverUrls) {
        delete req.session.initialCoverUrls[work_olid];
    }

    card.sessionCoverUrl = sessionCoverUrl;

    // console.log (card);

    res.render('work.ejs', {
        user: user,
        card: card,
        processUserScore: ejsHelpers.processUserScore,
        processScore: ejsHelpers.processScore,
        scoreToStars: ejsHelpers.scoreToStars,
        processAuthors: ejsHelpers.processAuthors,
        processDescription: ejsHelpers.processDescription,
        toTitleCase: ejsHelpers.toTitleCase,
    })

});

//-------------------------------------
// 7.	Search 
//-------------------------------------
app.get('/search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (!query) return res.redirect('/browse');

    try {
        const {
            cards,
            totalCount
        } = await be.getSearchResultCard(query);
        res.render('search-results.ejs', {
            query,
            cards,
            totalCount,
            scoreToStars: ejsHelpers.scoreToStars
        });
    } catch (err) {
        console.error('Search route failed:', err);
        res.status(500).render('error', {
            message: "Failed to fetch search results."
        });
    }
});

app.post('/search/covers', async (req, res) => {
    const {
        urls
    } = req.body;
    if (!Array.isArray(urls) || !urls.length) return res.json({});

    try {
        const results = await file.getOlImage('edition', urls, 'M');
        const arr = Array.isArray(results) ? results : [results];
        const map = {};
        arr.forEach(r => {
            if (r.status === 'downloaded' || r.status === 'cached') {
                map[r.remoteImageUrl] = r.localPath;
            }
        });
        res.json(map);
    } catch (err) {
        console.error('Error fetching covers:', err);
        res.status(500).json({});
    }
});


//-------------------------------------
//     **** Data handling ****
//-------------------------------------
// TESTS fo OL API interactions
app.get('/OLsearch', validateQuery(['type', 'criteria', 'page', 'limit', 'language']), async (req, res) => {
    const criteria = req.query.criteria;
    const type = req.query.type;
    const page = req.query?.page || 1;
    const language = req.query?.language || undefined;
    const limit = req.query?.limit || undefined;
    const offset = req.query?.offset || undefined;
    const workSearchFields = req.query?.workSearchFields || undefined;

    try {
        const response = await ol.getOlData(type, criteria, page, language, limit, offset, workSearchFields);
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
app.post('/add-edition', validateBody(['edition_olid']), async (req, res) => {
    // 2. Extract edition_olid from req.body
    const {
        edition_olid
    } = req.body;

    // 1. Authentication and Authorization Check
    if (!req.session.isLoggedIn || !req.session.user?.id) {
        console.error(`Not Authorised to Add Books: User not logged in or user ID missing`);
        return res.status(401).json({
            error: 'Not Authorised to Add Books: User not logged in'
        });
    }

    const user_id = req.session.user.id;
    // console.log(req.body);

    try {


        // 2. Call the backend function to add the edition
        // The `true` argument means force a refresh/download if it already exists.
        const response = await be.selectedEdition(user_id, edition_olid, true);

        // 3. Respond with success message
        console.log(`Successfully processed edition ${edition_olid} for user ${user_id}. Message: ${response}`);
        return res.status(200).json({
            message: response
        });
    } catch (error) {
        // 4. Error Handling
        // validateOlid function throws errors that are caught here.
        console.error(`Error in /add-edition route for user ${user_id}, edition ${edition_olid}:`, error.message);

        // Check if the error is from validateOlid (an instance of Error)
        // or a custom error with a statusCode property from be.selectedEdition.
        const statusCode = error.statusCode || (error instanceof Error ? 400 : 500); // 400 for validation errors

        res.status(statusCode).json({
            error: error.message || 'Failed to process selected edition.'
        });
    }
});

//-------------------------------------
// 2. POST a user score 
//-------------------------------------
app.post('/set-user-score', validateBody(['edition_olid', 'score']), async (req, res) => {
    // Ensure user is logged in
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({
            success: false,
            message: 'You must be logged in to set a score.'
        });
    }

    const {
        edition_olid,
        score
    } = req.body;
    const user_id = req.session.user.id;


    try {
        const result = await patchUserReview(user_id, edition_olid, {
            score
        });

        if (result.review.score === score) {

            res.json({
                success: true,
                message: 'Rating updated successfully.',
                newUserScore: result.review.score,
                newWorkScore: result.workScore,
                newWorkReviewCount: result.reviewCount
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

//-------------------------------------
// 3. POST a user review 
//-------------------------------------
app.post('/set-user-review', validateBody(['edition_olid', 'review', 'review_title', 'score']), async (req, res) => {
    // Ensure user is logged in
    if (!req.session.user || !req.session.user.id) {
        return res.status(401).json({
            success: false,
            message: 'You must be logged in to edit/post a review.'
        });
    }

    const {
        edition_olid,
        review,
        review_title,
        score
    } = req.body;
    const user_id = req.session.user.id;

    try {
        const result = await putUserReview(user_id, edition_olid, review_title, review, score);

        return res.json({
            success: true,
            message: 'Review saved.',
            userReviewID: result.review.review_id,
            workScore: result.workScore,
            reviewCount: result.reviewCount
        });

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