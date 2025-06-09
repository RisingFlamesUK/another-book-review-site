document.addEventListener('DOMContentLoaded', () => {
  const tabContainer = document.querySelector('.tab-container');
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanels = document.querySelectorAll('.tab-panel');
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

    // Initially show the tab based on the activeTab from the server
    if (initialTab) {
      showPanel(initialTab);
      const initialActiveButton = document.querySelector(`.tab-button[data-tab="${initialTab}"]`);
      if (initialActiveButton) {
        activateTabButton(initialActiveButton);
      }
    }
  }

  // Disable signup button on submit and show message
  if (loginForm && loginButton && loginStatusMessage) {
    loginForm.addEventListener('submit', () => {
      loginButton.disabled = true;
      loginButton.textContent = 'Logging in...';
      loginStatusMessage.innerHTML = '<p>Logging in please wait....</p>';
    });
  }

  // Disable signup button on submit and show message
  if (signupForm && signupButton && signupStatusMessage) {
    signupForm.addEventListener('submit', () => {
      signupButton.disabled = true;
      signupButton.textContent = 'Signing up...';
      signupStatusMessage.innerHTML = '<p>Signing up and logging in please wait....</p>';
    });
  }
});