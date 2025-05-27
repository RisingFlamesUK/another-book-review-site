// This file is /utils/utilsjs
import EmailValidation from 'emailvalid';
import * as db from './db-handler.js'

export async function validateUser(username, password, email, newUser) {
    const errors = [];

    const usernameError = await validateUsername(username, newUser);
    if (usernameError instanceof Error) {
        errors.push({
            field: 'username',
            message: usernameError.message
        });
    };

    const passwordErrors = await validatePassword(password);
    if (passwordErrors instanceof Error) {
        errors.push({
            field: 'password',
            message: passwordErrors.message
        });
    };

    if (newUser) {
        const emailErrors = await validateEmail(email);
        if (emailErrors instanceof Error) {
            errors.push({
                field: 'email',
                message: emailErrors.message
            });
        };
    };

    return errors.length > 0 ? errors : null; // Return the errors array or null if no errors
}

async function validateUsername(username, newUser = false) {
    try {
        //check if the user exists already (if we're checking for a new user)
        if (newUser) {
            const existingUserByUsername = await db.findUser("username", username);
            if (existingUserByUsername) {
                const error = new Error(`User: "${username}" already exists`);
                error.statusCode = 400;
                throw error;
            };
        }

        //check the username is at minimum length
        if (username.length < 4) {
            const error = new Error('username must be at least 4 characters long');
            error.statusCode = 400;
            throw error;
        }

        return null;

    } catch (error) {
        return error;
    }
}

async function validateEmail(email) {
    try {
        //convert email to lower case
        email = email.toLowerCase();

        //check if the email address is valid    
        const ev = new EmailValidation()
        
        //**** ev.setOptions({ allowDisposable: false, blacklist: ['baddomain.com'] }); **** Optionally invalidate disposible and add a blacklist
        ev.setOptions({ allowDisposable: false, allowFreemail: true})

        const validEmail = ev.check(email);
        if (!validEmail.valid) {
            const error = new Error(`Invalid email address because: ${validEmail.errors}`);
            error.statusCode = 400;
            throw error;
        };

        //check if the email address is already used for a user account
        const existingUserByEmail = await db.findUser("email", email);
        console.log (existingUserByEmail);
        console.log("email:", email)

        if (existingUserByEmail) {
            const error = new Error(`${email} already has an account`);
            error.statusCode = 400;
            throw error;
        }

        return null;

    } catch (error) {
        return error;
    }
}

async function validatePassword(password) {
    try {
        //check the password is at minimum length
        if (password.length < 8) {
            const error = new Error('Password must be at least 8 characters long');
            error.statusCode = 400;
            throw error;
        }
        
        // toDo: add other criteria e.g meets min strength
        return null;

    } catch (error) {
        return error;
    }
}