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

    // Get references to all individual book card elements
    const allBookCardElements = Array.from(bookCardsContainer.querySelectorAll('.card-container'));

    // Map edition_olid to its DOM element for quick lookup
    const cardElementMap = new Map();
    allBookCardElements.forEach(element => {
        cardElementMap.set(element.dataset.editionOlid, element);
    });

    function applyFiltersAndSearch() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const selectedStatusId = statusFilter.value;

        // Reset the list of currently matched cards
        filteredAndSearchedCardElements = [];

        // First, determine which cards match the current search and filter criteria
        allBookCardElements.forEach(cardElement => {
            const cardTitle = cardElement.dataset.title ? cardElement.dataset.title.toLowerCase() : '';
            const cardAuthors = cardElement.dataset.authors ? cardElement.dataset.authors.toLowerCase() : ''; // Comma-separated author names
            const cardStatusId = cardElement.dataset.statusId;

            const matchesSearch = (searchTerm === '' || cardTitle.includes(searchTerm) || cardAuthors.includes(searchTerm));
            const matchesFilter = (selectedStatusId === 'all' || cardStatusId === selectedStatusId);

            if (matchesSearch && matchesFilter) {
                filteredAndSearchedCardElements.push(cardElement);
            }
        });

        // Reset to first page whenever filters or search terms change
        currentPage = 1;
        renderCurrentPage();
    }

    function renderCurrentPage() {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;

        // Hide all cards initially
        allBookCardElements.forEach(cardElement => {
            cardElement.classList.add('invisible');
            cardElement.classList.remove('visible');
        });

        // Display only the cards for the current page
        const cardsToDisplay = filteredAndSearchedCardElements.slice(startIndex, endIndex);

        if (cardsToDisplay.length > 0) {
            cardsToDisplay.forEach(cardElement => {
                cardElement.classList.remove('invisible');
                cardElement.classList.add('visible');
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
                noBooksMessage.classList.add('padding-x10');
                noBooksMessage.classList.add('no-results-message');
                noBooksMessage.textContent = 'No matching books found.';
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

        cardContainer.addEventListener('click', function () {
            // Retrieve all data from the data-attributes
            const dataToPass = {
                edition_olid: this.dataset.editionOlid,
                work_olid: this.dataset.workOlid,
                title: this.dataset.title,
                publish_date: this.dataset.publishDate,
                // Decode strings back to original format
                description: decodeURIComponent(this.dataset.description),
                cover_url: this.dataset.coverUrl,
                status_id: this.dataset.statusId,
                score: this.dataset.score,
                authors: decodeURIComponent(this.dataset.authors),
                languages: this.dataset.languages
            };

            // Remove any existing hidden inputs from previous clicks to prevent duplication
            form.querySelectorAll('input[type="hidden"]').forEach(input => input.remove());

            // Create hidden input fields for each piece of data
            for (const key in dataToPass) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = key; // Use the actual key as the name
                // For objects/arrays, ensure they are stringified again for submission
                input.value = (typeof dataToPass[key] === 'object' && dataToPass[key] !== null) ?
                    JSON.stringify(dataToPass[key]) :
                    dataToPass[key];
                form.appendChild(input);
            }

            form.submit();
        });

        // Add keyboard accessibility: allow submitting the form with Enter key when card is focused
        cardContainer.addEventListener('keypress', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevent default action (e.g., scrolling)
                this.click(); // Trigger the click event, which submits the form
            }
        });
    });

    // Initial render when the page loads
    // This will set up the initial display and pagination controls
    applyFiltersAndSearch();
});