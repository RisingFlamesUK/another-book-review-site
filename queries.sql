
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS users;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Tables --
CREATE TABLE
    users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        image TEXT,
        enc_password TEXT NOT NULL,
        status TEXT DEFAULT 'not active',
        created_at TIMESTAMP
        WITH
            TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE session (
    sid varchar(255) COLLATE pg_catalog."default" NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid)
)
WITH (
    OIDS = FALSE
);

CREATE INDEX "IDX_session_expire" ON session (expire);