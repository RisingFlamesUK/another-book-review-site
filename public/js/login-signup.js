// public/js/login-signup.js
document.addEventListener('DOMContentLoaded', () => {
    const loginSignupOriginalPathname = window.location.pathname;
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

                // IMPORTANT: When updating the hash on tab click,
                // use the `loginSignupOriginalPathname` to ensure the URL always
                // refers to the actual login-signup page path, not the replaced
                // path from the history entry.
                const newUrl = loginSignupOriginalPathname + window.location.search + '#' + targetPanelId;
                history.replaceState(null, '', newUrl);
                console.log("[DEBUG] login-signup.js (Tab Click): URL hash updated in address bar and history to: " + newUrl);
          
            });
        });

        // Initialize active tab on page load
        // Get the hash from the *actual address bar*. This will be either '#login', '#signup'
        // or empty/null if the EJS script successfully cleaned it up on initial load.
        // This logic focuses on *displaying* the correct tab, not manipulating history.
        const hashFromAddressBar = window.location.hash.replace('#', '');
        if (hashFromAddressBar === 'login' || hashFromAddressBar === 'signup') {
            showPanel(hashFromAddressBar);
            const initialActiveButton = document.querySelector(`.tab-button[data-tab="${hashFromAddressBar}"]`);
            if (initialActiveButton) {
                activateTabButton(initialActiveButton);
            }
        } else if (initialTab) { // Fallback to server-defined initial tab (e.g., if no hash or hash was cleaned)
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

    // Signup Form Submission and Password Confirmation Logic
     if (signupForm) {
        const signupPassword = document.getElementById('signup-password');
        const signupConfirmPassword = document.getElementById('signup-confirm-password');
        const passwordMatchError = document.getElementById('password-match-error');

        const checkPasswordsMatch = () => {
            if (signupPassword && signupConfirmPassword) {
                if (signupPassword.value !== signupConfirmPassword.value) {
                    passwordMatchError.style.display = 'block';
                    signupConfirmPassword.setCustomValidity("Passwords do not match.");
                    return false;
                } else {
                    passwordMatchError.style.display = 'none';
                    signupConfirmPassword.setCustomValidity("");
                    return true;
                }
            }
            return false;
        };

        if (signupPassword) {
            signupPassword.addEventListener('input', checkPasswordsMatch);
        }
        if (signupConfirmPassword) {
            signupConfirmPassword.addEventListener('input', checkPasswordsMatch);
        }

        signupForm.addEventListener('submit', (event) => {
            const passwordsAreValid = checkPasswordsMatch();
            if (!passwordsAreValid) {
                event.preventDefault();
                signupConfirmPassword.focus();
            } else {
                if (signupButton && signupStatusMessage) {
                    signupButton.disabled = true;
                    signupButton.textContent = 'Signing up...';
                    signupStatusMessage.innerHTML = '<p>Signing up and logging in please wait....</p>';
                }
            }
        });
    }
});