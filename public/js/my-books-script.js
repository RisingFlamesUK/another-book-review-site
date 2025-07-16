// public/js/my-books-script.js
document.addEventListener('DOMContentLoaded', () => {
    //We have allUserBooks and allStatus already
    // Filter elements
    const bookCardsContainer = document.querySelector('.card-holder-cards');
    const searchInput = document.getElementById('bookSearch');
    const statusFilter = document.getElementById('statusFilter');

    // Pagination elements
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageNumbersContainer = document.getElementById('pageNumbers');

    // Dropdown for items per page
    const itemsPerPageDropdown = document.getElementById('itemsPerPageDropdown');

    let ITEMS_PER_PAGE = parseInt(itemsPerPageDropdown.value);
    let currentPage = 1;
    let filteredAndSearchedCardElements = [];

    // Get references to all individual book card *form* elements
    const allBookCardForms = Array.from(bookCardsContainer.querySelectorAll('.card-form'));

    // Map edition_olid to its DOM element for quick lookup
    // Update: Map edition_olid to the .card-form element
    const cardElementMap = new Map();
    allBookCardForms.forEach(formElement => {
        // Assuming edition_olid is on the card-container within the form, or the form itself.
        // If it's on the card-container, you'll need to get it like this:
        const cardContainer = formElement.querySelector('.card-container');
        if (cardContainer) { // Ensure cardContainer exists
            cardElementMap.set(cardContainer.dataset.editionOlid, formElement); // Store the form element
        }
    });

    function applyFiltersAndSearch() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const selectedStatusId = statusFilter.value;

        // Reset the list of currently matched cards (now forms)
        filteredAndSearchedCardElements = [];

        // First, determine which cards match the current search and filter criteria
        allBookCardForms.forEach(formElement => { // Iterate over forms
            const cardContainer = formElement.querySelector('.card-container'); // Get the inner div
            if (!cardContainer) return; // Skip if no card-container found within form

            const cardTitle = cardContainer.dataset.title ? cardContainer.dataset.title.toLowerCase() : '';
            const cardAuthors = cardContainer.dataset.authors ? cardContainer.dataset.authors.toLowerCase() : '';
            const cardStatusId = cardContainer.dataset.statusId;

            const matchesSearch = (searchTerm === '' || cardTitle.includes(searchTerm) || cardAuthors.includes(searchTerm));
            const matchesFilter = (selectedStatusId === 'all' || cardStatusId === selectedStatusId);

            if (matchesSearch && matchesFilter) {
                filteredAndSearchedCardElements.push(formElement); // Push the form element
            }
        });

        // Reset to first page whenever filters or search terms change
        currentPage = 1;
        renderCurrentPage();
    }

    function renderCurrentPage() {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;

        // Hide all *form* elements initially
        allBookCardForms.forEach(formElement => {
            formElement.classList.add('invisible');
            formElement.classList.remove('visible');
        });

        // Display only the *form* elements for the current page
        const cardsToDisplay = filteredAndSearchedCardElements.slice(startIndex, endIndex);

        if (cardsToDisplay.length > 0) {
            cardsToDisplay.forEach(formElement => { // Iterate over forms
                formElement.classList.remove('invisible');
                formElement.classList.add('visible');
            });

            // Remove "No matching books" message if present
            const existingMessage = document.getElementById('noMatchingBooksMessage');
            if (existingMessage) {
                existingMessage.remove();
            }

        } else {
            // Display "No matching books" message if no cards to show on this page
            if (!document.getElementById('noMatchingBooksMessage')) {
                const noBooksMessage = document.createElement('p');
                noBooksMessage.id = 'noMatchingBooksMessage';
                // noBooksMessage.classList.add('padding-x10');
                noBooksMessage.classList.add('no-results-message');

                 if (allBookCardForms.length === 0) {
                    noBooksMessage.textContent = 'No books found in your library. Please add books to see them here.';
                } else {
                    noBooksMessage.textContent = 'No matching books found.';
                }

                bookCardsContainer.appendChild(noBooksMessage);
            }
        }

        updatePaginationControls();
    }

    function updatePaginationControls() {
        const totalPages = Math.ceil(filteredAndSearchedCardElements.length / ITEMS_PER_PAGE);

        // Update Prev/Next buttons
        prevPageBtn.disabled = (currentPage === 1);
        nextPageBtn.disabled = (currentPage === totalPages || totalPages === 0);

        // Update page numbers
        pageNumbersContainer.innerHTML = ''; // Clear previous numbers
        if (totalPages > 0) {
            for (let i = 1; i <= totalPages; i++) {
                const pageBtn = document.createElement('button');
                pageBtn.textContent = i;
                pageBtn.classList.add('page-number-btn');
                if (i === currentPage) {
                    pageBtn.classList.add('active'); // Add an 'active' class for styling
                }
                pageBtn.addEventListener('click', () => {
                    currentPage = i;
                    renderCurrentPage();
                });
                pageNumbersContainer.appendChild(pageBtn);
            }
        }
    }



    // Add event listeners
    // Event Listeners for Filters/Search
    searchInput.addEventListener('input', applyFiltersAndSearch);
    statusFilter.addEventListener('change', applyFiltersAndSearch);

    // Event Listener for the items per page dropdown
    itemsPerPageDropdown.addEventListener('change', (event) => {
        ITEMS_PER_PAGE = parseInt(event.target.value);
        applyFiltersAndSearch();
    });


    // Event Listeners for Pagination Buttons
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderCurrentPage();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredAndSearchedCardElements.length / ITEMS_PER_PAGE);
        if (currentPage < totalPages) {
            currentPage++;
            renderCurrentPage();
        }
    });

    // Event Listeners for Edition Cards
    const allCardForms = document.querySelectorAll('.card-form');

    allCardForms.forEach(form => {
        const cardContainer = form.querySelector('.card-container');

        cardContainer.addEventListener('click', function (event) {
            if (!event.defaultPrevented) {
                // *** IMPORTANT CHANGE HERE: Navigate directly to the GET route ***
                window.location.href = `/edition/${this.dataset.editionOlid}`;
            }
        });

        // Add keyboard accessibility: allow submitting the form with Enter key when card is focused
        cardContainer.addEventListener('keypress', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevent default action (e.g., scrolling)
                this.click(); // This will now trigger the modified click event above
            }
        });
    });

    // Initial render when the page loads
    // This will set up the initial display and pagination controls
    applyFiltersAndSearch();
});