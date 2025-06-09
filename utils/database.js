// This file is /utils/database.js
import pg from 'pg';
import dotenv from 'dotenv';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

dotenv.config();

const database = new pg.Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DB,
    password: process.env.PG_PASS,
    port: parseInt(process.env.PG_PORT),
});

database.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

const PGStore = connectPgSimple(session);

export { database, PGStore };