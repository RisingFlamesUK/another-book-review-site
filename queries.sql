DROP TABLE IF EXISTS book_review;
DROP TABLE IF EXISTS book_notes;
DROP TABLE IF EXISTS users_books;
DROP TABLE IF EXISTS statuses;
DROP TABLE IF EXISTS editions_languages;
DROP TABLE IF EXISTS authors_books;
DROP TABLE IF EXISTS authors;
DROP TABLE IF EXISTS book_editions;
DROP TABLE IF EXISTS works_subjects;
DROP TABLE IF EXISTS works_scores;
DROP TABLE IF EXISTS book_works;
DROP TABLE IF EXISTS languages;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS users;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Tables - user management --
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 () NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    image TEXT,
    enc_password TEXT NOT NULL,
    status TEXT DEFAULT 'not active',
    created TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE session (
    sid varchar(255) COLLATE pg_catalog."default" NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) WITH TIME ZONE NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid)
) WITH (OIDS = FALSE);

CREATE INDEX "IDX_session_expire" ON session (expire);

-- Create Tables - book management --
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    UNIQUE (name, type)

);

CREATE TABLE languages (
    id BIGSERIAL PRIMARY KEY,
    language TEXT NOT NULL,
    key TEXT NOT NULL
);

CREATE TABLE book_works (
    work_olid TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    first_publication_date TEXT,
    last_refreshed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE works_scores (
    work_olid TEXT PRIMARY KEY NOT NULL,
    score INTEGER NOT NULL,
    review_count INTEGER NOT NULL,
    last_checked TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE works_subjects (
    id SERIAL PRIMARY KEY NOT NULL,
    work_olid TEXT REFERENCES book_works (work_olid) ON DELETE CASCADE NOT NULL,
    subject_id INTEGER REFERENCES subjects (id) ON DELETE CASCADE NOT NULL,
    UNIQUE (work_olid, subject_id)
);

CREATE TABLE book_editions (
    edition_olid TEXT PRIMARY KEY NOT NULL,
    work_olid TEXT REFERENCES book_works (work_olid) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    publish_date TEXT NOT NULL,
    cover_url TEXT,
    last_refreshed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE authors (
    author_olid TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    bio TEXT,
    birth_date TEXT,
    death_date TEXT,
    pic_url TEXT,
    last_refreshed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE authors_books (
    id SERIAL PRIMARY KEY NOT NULL,
    author_olid TEXT REFERENCES authors (author_olid) ON DELETE RESTRICT NOT NULL,
    edition_olid TEXT REFERENCES book_editions (edition_olid) ON DELETE CASCADE NOT NULL,
    UNIQUE (author_olid, edition_olid)
);

CREATE TABLE editions_languages (
    id SERIAL PRIMARY KEY NOT NULL,
    edition_olid TEXT REFERENCES book_editions (edition_olid) ON DELETE CASCADE NOT NULL,
    language_id INTEGER REFERENCES languages (id) ON DELETE CASCADE NOT NULL,
    last_refreshed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (edition_olid, language_id) 
);


-- Create Tables - user book management --
CREATE TABLE statuses (
    id SERIAL PRIMARY KEY NOT NULL,
    status TEXT NOT NULL UNIQUE
);

CREATE TABLE users_books (
    id SERIAL PRIMARY KEY NOT NULL,
    edition_olid TEXT REFERENCES book_editions (edition_olid) ON DELETE RESTRICT NOT NULL,
    user_id UUID REFERENCES users (id) ON DELETE CASCADE NOT NULL,
    status_id INTEGER REFERENCES statuses (id) ON DELETE RESTRICT,
    date_added TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (edition_olid, user_id)
);

CREATE TABLE book_notes (
    id BIGSERIAL PRIMARY KEY,
    user_book_id INTEGER REFERENCES users_books (id) ON DELETE CASCADE,
    notes TEXT NOT NULL,
    created TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE book_review (
    id BIGSERIAL PRIMARY KEY,
    user_book_id INTEGER REFERENCES users_books (id) ON DELETE
    SET
        NULL,
        review TEXT NOT NULL,
        score INTEGER,
        created TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        last_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Populate the status table --
INSERT INTO
    statuses (status)
VALUES
    ('Unread'),
    ('Unread - Owned'),
    ('Unread - Borrowed'),
    ('Reading'),
    ('Completed'),
    ('Want');

-- Populate the subjects table --
INSERT INTO
    subjects (name, type)
VALUES
    ('Architecture', 'Arts'),
    ('Art Instruction', 'Arts'),
    ('Art History', 'Arts'),
    ('Dance', 'Arts'),
    ('Design', 'Arts'),
    ('Fashion', 'Arts'),
    ('Film', 'Arts'),
    ('Graphic Design', 'Arts'),
    ('Music', 'Arts'),
    ('Music Theory', 'Arts'),
    ('Painting', 'Arts'),
    ('Photography', 'Arts'),
    ('Bears', 'Animals'),
    ('Cats', 'Animals'),
    ('Kittens', 'Animals'),
    ('Dogs', 'Animals'),
    ('Puppies', 'Animals'),
    ('Fantasy', 'Fiction'),
    ('Historical Fiction', 'Fiction'),
    ('Horror', 'Fiction'),
    ('Humor', 'Fiction'),
    ('Literature', 'Fiction'),
    ('Magic', 'Fiction'),
    ('Mystery and detective stories', 'Fiction'),
    ('Plays', 'Fiction'),
    ('Poetry', 'Fiction'),
    ('Romance', 'Fiction'),
    ('Science Fiction', 'Fiction'),
    ('Short Stories', 'Fiction'),
    ('Thriller', 'Fiction'),
    ('Biology', 'Science & Mathematics'),
    ('Chemistry', 'Science & Mathematics'),
    ('Mathematics', 'Science & Mathematics'),
    ('Physics', 'Science & Mathematics'),
    ('Programming', 'Science & Mathematics'),
    ('Management', 'Business & Finance'),
    ('Entrepreneurship', 'Business & Finance'),
    ('Business Economics', 'Business & Finance'),
    ('Business Success', 'Business & Finance'),
    ('Finance', 'Business & Finance'),
    ('Kids Books', 'Children''s'),
    ('Stories in Rhyme', 'Children''s'),
    ('Baby Books', 'Children''s'),
    ('Bedtime Books', 'Children''s'),
    ('Picture Books', 'Children''s'),
    ('Ancient Civilization', 'History'),
    ('Archaeology', 'History'),
    ('Anthropology', 'History'),
    ('World War II', 'History'),
    ('Social Life and Customs', 'History'),
    ('Cooking', 'Health & Wellness'),
    ('Cookbooks', 'Health & Wellness'),
    ('Mental Health', 'Health & Wellness'),
    ('AduExerciselt', 'Health & Wellness'),
    ('Nutrition', 'Health & Wellness'),
    ('Self-help', 'Health & Wellness'),
    ('Autobiographies', 'Biography'),
    ('History', 'Biography'),
    ('Politics and Government', 'Biography'),
    ('World War II', 'Biography'),
    ('Women', 'Biography'),
    ('Kings and Rulers', 'Biography'),
    ('Composers', 'Biography'),
    ('Artists', 'Biography'),
    ('Anthropology', 'Social Sciences'),
    ('Religion', 'Social Sciences'),
    ('Political Science', 'Social Sciences'),
    ('Psychology', 'Social Sciences'),
    ('Brazil', 'Places'),
    ('India', 'Places'),
    ('Indonesia', 'Places'),
    ('United Kingdom', 'Places'),
    ('United States', 'Places'),
    ('History', 'Textbooks'),
    ('Mathematics', 'Textbooks'),
    ('Geography', 'Textbooks'),
    ('Psychology', 'Textbooks'),
    ('Algebra', 'Textbooks'),
    ('Education', 'Textbooks'),
    ('Business & Economics', 'Textbooks'),
    ('Science', 'Textbooks'),
    ('Chemistry', 'Textbooks'),
    ('English Language', 'Textbooks'),
    ('Physics', 'Textbooks'),
    ('Computer Science', 'Textbooks');

INSERT INTO
    languages (language, key)
VALUES
    ('English', 'eng');