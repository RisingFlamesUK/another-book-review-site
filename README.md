# 📚 Bookwork Reviews

This site was created in order to practice and showcase my skills and was a capstone project within a udemy course:
**"The Complete Full-Stack Web Development Bootcamp"** - Dr Angela Yu

This is Capstone 5, which requires the creation of a Book Notes site. I have gone a few steps further and included multi-user access, user authentication, book reviews and scoring.
Due to increased scope (which I wanted to do as this will be part of my portfolio), I spent approximately 1 month and a half actively working on this capstone project.
All password data is encrypted by the database. I recommend altering the code to use HTTPS to ensure all client server communication is encrypted if you are going to use this on the web.

I use a combination of APIs provided by Open Library:
[`Open Library API`](https://openlibrary.org/developers/api)

---

## TO DO:

- Add user book status selection to editions (Unread, Unread (Owned), Unread (Borrowed), Reading, Want, Completed)
- Allow users to remove a book from their collection (Demonstrate ability to delete data)
- **stretch goal:** implement multi-language support
- **stretch goal:** add user profile management (including picture upload & default language setting)
- **stretch goal:** update the edition page to allow user notes to be added 

---

## Using the code

---

This site was created using `Node.js` and a `PostgreSQL v17` database. You will need both.
I used `Node.js version v24.1.0`, which was the latest at the time of writing. Using other version may yield unexpected results.

1. Create a `.env` file in root
    
    ```bash
    touch .env
    ```

2. edit `.env` and include the following lines

    ```env
    # BCrypt Gen
    SALT_ROUNDS=15

    # Postgres
    PG_USER=[postgres username]
    PG_PASS=[postgres password]
    PG_DB=[postgres database name]
    PG_PORT=[postgres port]
    PG_HOST=[postgres hostname]

    #Cache Age
    WORK_OLID='7 days'
    EDITION_OLID='14 days'
    DB_TRENDING_REEL='Daily'
    DB_SUBJECT_REEL='Hourly'
    ```

3. Run the queries in `queries.sql` to generate the database tables required in PostgreSQL.

4. Run the following commands:

    ```bash
    npm i
    npm audit fix   #(if needed)
    node app.js     #(or nodemon app.js if you want to use nodemon instead)
    ```

---

## Objectives

---

Here are the stated objectives (by Dr Angela Yu) and requirements from the course for this capstone:

- Revise how to integrate public APIs into web projects.
- Gain more experience using Express/Node.js for server-side programming.
- Demonstrate ability to Create Read Update and Delete data in a PostgreSQL Database to persist data.

---

## Project Requirements

---

1. **Database Persistance**

Persist data using a PostgreSQL database.
Use CRUD methods to manipulate data in the database.

2. **Project Planning**

Think through your project, researching the API documentation, project features, what data you will store, and how it will be used in your web application.
Draw a database diagram on `draw.io` and plan out any relationships.
Think through the PostgreSQL command you will need to write to create the schema for your database.

3. **Project Setup**

Set up a new Node.js project using Express.js.
Include `pg` for working with your localhost PostgreSQL database.
Include `EJS` for templating.
Create a frontend in HTML CSS JS.
Ensure that the project has a structured directory and file organization.

4. **API Integration**

Implement at least a GET endpoint to interact with your chosen API.
Use `Axios` to send HTTP requests to the API and handle responses.

5. **Data Presentation**

Design the application to present the book covers from the API and the data in your database a in a user-friendly way.
Use appropriate HTML, CSS, and a templating engine like EJS.
Think about how you would allow the user to sort the data from the database.

6. **Error Handling**

Ensure that error handling is in place for both your application and any API requests. You can console log any errors, but you can also give users any user-relevant errors.

7. **Documentation**

Include comments throughout your code to explain your logic.

8. **Code Sharing**

Use what you have learnt about GitHub to commit and push your project to GitHub so that you can share it with other students in the Q&A area, I'd love to see what you've build too! You can tweet at me `@yu_angela`
Include a `Readme.md` file that explains how to start your server, what commands are needed to run your code. e.g. `npm i` and then `nodemon index.js`.

## In this Commited Change

- fix in collection badge / add to collection button on work-edition-script (for works.ejs)
- cleaner way to pass data to client side js (for works.ejs / my-books.ejs)
- cleanup unused files