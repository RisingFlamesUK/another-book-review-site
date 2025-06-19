document.addEventListener('DOMContentLoaded', () => {
    const tabContainer = document.querySelector('.tab-container');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    // Declare these once at the top level of DOMContentLoaded
    const signupForm = document.getElementById('signup-form');
    const signupButton = document.getElementById('signup-button');
    const signupStatusMessage = document.getElementById('signup-status-message');
    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('login-button');
    const loginStatusMessage = document.getElementById('login-status-message');

    const initialTab = tabContainer ? tabContainer.dataset.initialTab : null;
    const loginUsernameInput = document.getElementById('login-username');
    const signupUsernameInput = document.getElementById('signup-username');

    if (tabContainer && tabButtons.length > 0 && tabPanels.length > 0) {
        function showPanel(panelId) {
            tabPanels.forEach(panel => panel.classList.remove('active'));
            const panelToShow = document.getElementById(panelId);
            if (panelToShow) {
                panelToShow.classList.add('active');
                if (panelId === 'login' && loginUsernameInput) {
                    loginUsernameInput.focus();
                } else if (panelId === 'signup' && signupUsernameInput) {
                    signupUsernameInput.focus();
                }
            }
        }

        function activateTabButton(button) {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        }

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetPanelId = button.dataset.tab;
                showPanel(targetPanelId);
                activateTabButton(button);
            });
        });

        if (initialTab) {
            showPanel(initialTab);
            const initialActiveButton = document.querySelector(`.tab-button[data-tab="${initialTab}"]`);
            if (initialActiveButton) {
                activateTabButton(initialActiveButton);
            }
        }
    }

    // Disable login button on submit and show message
    if (loginForm && loginButton && loginStatusMessage) {
        loginForm.addEventListener('submit', () => {
            loginButton.disabled = true;
            loginButton.textContent = 'Logging in...';
            loginStatusMessage.innerHTML = '<p>Logging in please wait....</p>';
        });
    }

    // NEW: Refactored Signup Form Submission and Password Confirmation Logic
    if (signupForm) { // Only proceed if the signup form exists
        const signupPassword = document.getElementById('signup-password');
        const signupConfirmPassword = document.getElementById('signup-confirm-password');
        const passwordMatchError = document.getElementById('password-match-error');

        // Initial console logs to confirm elements are found
        console.log("login-signup.js loaded.");
        console.log("signupForm (top level):", signupForm);
        if (signupPassword && signupConfirmPassword && passwordMatchError) {
            console.log("All password elements found.");
        } else {
            console.warn("One or more password validation elements not found. Check IDs in EJS and JS.");
        }

        // Function to check if passwords match (used by input and submit listeners)
        const checkPasswordsMatch = () => {
            console.log("Checking passwords in real-time...");
            console.log("Password:", signupPassword ? signupPassword.value : 'N/A');
            console.log("Confirm Password:", signupConfirmPassword ? signupConfirmPassword.value : 'N/A');

            if (signupPassword && signupConfirmPassword) { // Ensure elements exist before accessing .value
                if (signupPassword.value !== signupConfirmPassword.value) {
                    passwordMatchError.style.display = 'block';
                    signupConfirmPassword.setCustomValidity("Passwords do not match."); // HTML5 validation
                    return false; // Passwords do NOT match
                } else {
                    passwordMatchError.style.display = 'none';
                    signupConfirmPassword.setCustomValidity(""); // Clear custom validity
                    return true; // Passwords match
                }
            }
            return false; // Default to false if elements are missing
        };

        // Add event listeners for real-time checking (if elements exist)
        if (signupPassword) {
            signupPassword.addEventListener('input', checkPasswordsMatch);
        }
        if (signupConfirmPassword) {
            signupConfirmPassword.addEventListener('input', checkPasswordsMatch);
        }

        // Single event listener for signup form submission
        signupForm.addEventListener('submit', (event) => {
            console.log("Signup form submitted (main listener).");

            // Perform the final password check
            const passwordsAreValid = checkPasswordsMatch();

            if (!passwordsAreValid) {
                console.log("Preventing form submission due to mismatched passwords!");
                event.preventDefault(); // STOP THE FORM SUBMISSION
                signupConfirmPassword.focus(); // Focus for user convenience
            } else {
                console.log("Passwords match, attempting server submission.");
                // If passwords match, then apply the button disabling and status message logic
                if (signupButton && signupStatusMessage) {
                    signupButton.disabled = true;
                    signupButton.textContent = 'Signing up...';
                    signupStatusMessage.innerHTML = '<p>Signing up and logging in please wait....</p>';
                }
            }
        });
    }
});