// /app.js
//--------------Section for imports-----------------//
import express from "express";
import session from "express-session";
import generateSecret from "./utils/encryption-handler.js";
import dotenv from 'dotenv';
import { PGStore, db } from './utils/db-handler.js'

dotenv.config();

const app = express();
const port = 3000;

const sessionSecret = process.env.SESSION_SECRET || generateSecret();

app.use(
    session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        store: new PGStore({
            pool: db, 
            tableName: 'session'
        }),
        cookie: {
            secure: false, // Set to true in production if using HTTPS
            path: '/'
        }
    })
);


//--------------------------------//
//           ROUTES
//--------------------------------//
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const authenticatedId = 123; // ... authentication logic ...

    if (authenticatedId) {
        req.session.user = { id: authenticated, username: username }; //get details
        req.session.isLoggedIn = true;
        req.session.save((err) => {
            if (err) {
                console.error('Error saving session:', err);
                return res.status(500).send('Error saving session');
            }
            res.redirect('/dashboard');
        });
    } else {
        res.status(401).send('Authentication failed');
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
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error during logout');
        }
        res.redirect('/login');
    });
});