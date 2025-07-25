// public/js/my-books-script.js
document.addEventListener('DOMContentLoaded', () => {
  const isMobile = window.matchMedia("(max-width: 800px)");
  let isSmallScreen = isMobile.matches;
  isMobile.addEventListener('change', e => {
    isSmallScreen = e.matches;
    renderCurrentPage();
  });

  const bookCardsContainer = document.querySelector('.card-holder-cards');
  const paginationList = document.getElementById('pagination-list');
  const paginationContainer = document.getElementById('pagination-controls');
  const searchInput = document.getElementById('bookSearch');
  const statusFilter = document.getElementById('statusFilter');
  const itemsPerPageDropdown = document.getElementById('itemsPerPageDropdown');

  let ITEMS_PER_PAGE = parseInt(itemsPerPageDropdown.value, 10);
  let currentPage = 1;
  const allBookCardForms = Array.from(bookCardsContainer.querySelectorAll('.card-form'));
  let filteredCardForms = [];

  function applyFiltersAndSearch() {
    const term = searchInput.value.toLowerCase().trim();
    const status = statusFilter.value;

    filteredCardForms = allBookCardForms.filter(form => {
      const cont = form.querySelector('.card-container');
      const title = (cont?.dataset.title || '').toLowerCase();
      const authors = (cont?.dataset.authors || '').toLowerCase();
      const statusId = cont?.dataset.statusId;

      return (
        (term === '' || title.includes(term) || authors.includes(term)) &&
        (status === 'all' || status === statusId)
      );
    });

    currentPage = 1;
    renderCurrentPage();
  }

  function renderCurrentPage() {
    // Always hide all cards first to ensure a clean slate for visibility toggling
    // This is crucial because showMessage no longer hides them by clearing innerHTML
    allBookCardForms.forEach(f => {
      f.classList.remove('visible');
      f.classList.add('invisible');
    });

    // (1) Completely empty library (no cards rendered initially)
    if (allBookCardForms.length === 0) {
      showMessage("No books in your collection! Browse and add books to your collection.");
      hidePagination();
      return;
    }

    // (2) Filtered with no matches
    if (filteredCardForms.length === 0) {
      showMessage("No matching books found.");
      hidePagination();
      return;
    }

    // If there are results, clear any previous message
    clearMessage();

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageForms = filteredCardForms.slice(start, start + ITEMS_PER_PAGE);

    // Show only the cards for the current page
    pageForms.forEach(f => {
      f.classList.remove('invisible');
      f.classList.add('visible');
    });

    // Show pagination if results span more than one page
    const totalPages = Math.ceil(filteredCardForms.length / ITEMS_PER_PAGE);
    if (totalPages <= 1) {
      hidePagination();
    } else {
      showPagination();
      updatePaginationControls();
    }
  }

  function showMessage(text) {
    clearMessage(); // Ensure only one message is present
    const msgElement = document.createElement('p');
    msgElement.classList.add('no-results-message');
    msgElement.textContent = text;
    // Append the message. The actual book cards are hidden by renderCurrentPage()
    bookCardsContainer.appendChild(msgElement);
  }

  function clearMessage() {
    const msg = bookCardsContainer.querySelector('.no-results-message');
    if (msg) msg.remove();
  }

  function hidePagination() {
    if (paginationContainer) paginationContainer.style.display = 'none';
    if (paginationList) paginationList.classList.add('invisible'); // Add invisible to UL
  }

  function showPagination() {
    if (paginationContainer) paginationContainer.style.display = '';
    if (paginationList) paginationList.classList.remove('invisible'); // Remove invisible from UL
  }

  function applyStatusClass(select) {
    // Remove existing status-* classes
    select.classList.remove('status-unread', 'status-reading', 'status-completed');

    const statusId = parseInt(select.value, 10);
    if ([1, 2, 3].includes(statusId)) {
      select.classList.add('status-unread');
    } else if (statusId === 4) {
      select.classList.add('status-reading');
    } else if (statusId === 5) {
      select.classList.add('status-completed');
    }
  }

  // Event listeners
  searchInput.addEventListener('input', applyFiltersAndSearch);
  statusFilter.addEventListener('change', applyFiltersAndSearch);
  itemsPerPageDropdown.addEventListener('change', ev => {
    ITEMS_PER_PAGE = parseInt(ev.target.value, 10);
    currentPage = 1;
    renderCurrentPage();
  });

  // Attach change listeners to all status dropdowns
  document.querySelectorAll('.status-select').forEach(select => {
    applyStatusClass(select);

    select.addEventListener('click', e => {
      e.stopPropagation();
    });
    select.addEventListener('change', async (event) => {
      event.stopPropagation();
      event.preventDefault();
      applyStatusClass(event.target);

      const editionOlid = select.dataset.editionOlid;
      const newStatusId = parseInt(select.value, 10);

      try {
        const response = await fetch('/set-user-book-status', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            edition_olid: editionOlid,
            status_id: newStatusId
          }),
        });

        const result = await response.json();

        if (!result.success) {
          alert(`Failed to update status: ${result.message}`);
        } else {
          const container = select.closest('.card-container');
          event.target.blur(); // Removes focus from the element (allows css formatting for selected status to apply)
          if (container) {
            container.dataset.statusId = newStatusId.toString();
            applyFiltersAndSearch(); // reapply filters in case this change affects visibility
          }
        }
      } catch (err) {
        console.error('Error updating status:', err);
        alert('An error occurred while updating status.');
      }
    });
  });

  allBookCardForms.forEach(form => {
    const cont = form.querySelector('.card-container');
    if (!cont) return;
    cont.addEventListener('click', () => {
      window.location.href = `/edition/${cont.dataset.editionOlid}`;
    });
    cont.addEventListener('keypress', ev => {
      if (ev.target.tagName.toLowerCase() === 'select') return;
      if (ev.key === 'Enter') {
        ev.preventDefault();
        cont.click();
      }
    });
  });

  // Initial load
  applyFiltersAndSearch();
});