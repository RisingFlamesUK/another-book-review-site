# 📚 Bookwork Reviews

Bookwork Reviews is a personal capstone project built to practice and showcase full-stack web development skills. It goes beyond the scope of the original course requirement and is designed to serve as a professional portfolio piece. The project simulates a multi-user book collection and review platform using real-world APIs and a relational database backend.

This was created as Capstone 5 for: **"The Complete Full-Stack Web Development Bootcamp"** by Dr. Angela Yu (Udemy)

---

## 🎓 Project Highlights

- Multi-user access with full authentication
- Persistent user book collections with status tracking
- Rating and review system for book editions
- Fully integrated with the Open Library API
- Book data caching with automatic fallback for missing info
- Custom search results pagination and dynamic cover loading

**Technologies used:**

- `Node.js` (v24.1.0)
- `Express.js`
- `PostgreSQL` (v17)
- `EJS` templating
- `Axios` for HTTP
- `bcrypt` for password security

---

## ⚖️ Capstone Scope vs. Original Requirements

The course required creating a basic book note-taking app. This project expands it to:

- Full authentication system
- Book reviews and star ratings
- Real-time data from Open Library
- Multi-page experience with search, edition browsing, and collection management

Total development time: \~6 weeks (active development)

Passwords are encrypted in the database. If deployed online, you should configure the project to use HTTPS.

---

## 🔗 Dependencies: Open Library API

This project uses data from the Open Library: [https://openlibrary.org/developers/api](https://openlibrary.org/developers/api)

---

## ⌛ TODO / Potential Extensions

I have finished working on this capstone for now as it exceeds the original scope and I need to continue with my course. Here are areas where I think it could do with improvement in case you are looking to build on it.\
Some of this is feedback from user testing:

- **user feedback stretch goal:** update search results page with additional search bar that populates with search last typed (easier to correct typo — currently you need to click back or navigate back to browse books and type it all again)
- **user feedback stretch goal:** auto-redirect to the edition page after adding to collection to allow immediate review or status change
- **stretch goal:** create a site navigation bar and move search to it (instead of first goal). Should also have My Books and Browse Books page links (replacing "Find More Books" button)
- **stretch goal:** create cron job to refresh cache with latest data, download trending data and subjects on a schedule
- **user feedback stretch goal:** preserve user's last 5 searches and allow user to return to them
- **stretch goal:** clean up and refactor code with improved comments
- **stretch goal:** add user profile management (including picture upload & default language setting)
- **stretch goal:** update the edition page to allow user notes to be added
- **stretch goal:** add subjects page linked from the browse
- **stretch goal:** implement multi-language support

---

## 🚀 Getting Started

You need:

- Node.js v24.1.0
- PostgreSQL v17

### 1. Setup `.env`

```bash
touch .env
```

Then edit `.env` with the following:

```env
# BCrypt Gen
SALT_ROUNDS=15

# Postgres
PG_USER=[postgres username]
PG_PASS=[postgres password]
PG_DB=[postgres database name]
PG_PORT=[postgres port]
PG_HOST=[postgres hostname]

# Cache durations
WORK_OLID='7 days'
EDITION_OLID='14 days'
DB_TRENDING_REEL='Daily'
DB_SUBJECT_REEL='Hourly'
```

### 2. Set up the database

Run the queries in `queries.sql` to create required tables.

### 3. Install dependencies and run server

```bash
npm i
npm audit fix   # optional
node app.js     # or use nodemon app.js
```

---

## 🔢 Original Capstone Requirements

### Goals from the course

- Integrate a public API
- Use CRUD operations on a PostgreSQL database
- Build a structured and maintainable Express app
- Render data with EJS templates and client-side JavaScript
- Create a usable and styled frontend
- Handle errors gracefully
- Use GitHub for collaboration and sharing

### Required features

1. **Database Persistence**\
   Use PostgreSQL with proper schema and relational data

2. **Planning**\
   Research APIs, draw ERDs, and plan features before building

3. **Setup**\
   Use Express + EJS + PostgreSQL + pg

4. **API Integration**\
   Use at least one GET request to pull real data

5. **Data Display**\
   Render book cover and metadata from API + DB

6. **Error Handling**\
   Provide user feedback or logs on error cases

7. **Documentation**\
   Well-commented code and clear instructions

8. **Sharing**\
   Push to GitHub with README and instructions

---

## 📂 Commit Summary

- Replaced all references to `updateWorkScore` with `refreshWorkScore`
- Standardized `client = undefined` usage across DB helpers for consistency
- Minor refactoring for readability and maintainability

