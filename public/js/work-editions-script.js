// This file is js/work-editions-script.js

/* global allWorkEditions, userLoggedIn */ // Hints for linting/IDE for global variables

document.addEventListener('DOMContentLoaded', () => {
    // ──────────────────────────────
    // 📌 DOM Elements
    const backButton = document.getElementById('back-button');
    const editionCardsContainer = document.querySelector('.edition-card-holder');
    const paginationList = document.getElementById('pagination-list');
    const languageFilter = document.getElementById('languageFilter');
    const editionSearchInput = document.getElementById('editionSearch');
    const sortOrderSelect = document.getElementById('sortOrder');

    // ──────────────────────────────
    // ⚙️ Initialization
    const mobileQuery = window.matchMedia('(max-width:800px)');
    let ITEMS_PER_PAGE = mobileQuery.matches ? 5 : 10; // Responsive items per page
    let currentPage = 1;

    // allWorkEditions is passed from the EJS template containing all edition data
    const allWorkEditionsInitial = allWorkEditions; // Stores the original, immutable data
    let currentFilteredAndSortedEditions = [...allWorkEditionsInitial]; // Mutable array for current state

    // Populate default language filter based on collection logic
    // This logic runs once on DOMContentLoaded
    (() => {
        const hasAnyCollectionItem = allWorkEditionsInitial.some(e => e.isInCollection);
        const collectionLanguagesAvailable = new Set();

        if (hasAnyCollectionItem) {
            allWorkEditionsInitial
                .filter(edition => edition.isInCollection && Array.isArray(edition.languages))
                .forEach(edition => edition.languages.forEach(lang => {
                    const lowerCaseLang = lang.toLowerCase();
                    if (lowerCaseLang !== 'language not found') {
                        collectionLanguagesAvailable.add(lowerCaseLang);
                    }
                }));
        }

        let initialSelectedLanguage = languageFilter.value;

        if (!hasAnyCollectionItem && initialSelectedLanguage === 'all') {
            // Rule 1: No collection items at all, AND the filter is currently set to 'all' -> Default to 'english'.
            initialSelectedLanguage = 'english';
        } else if (hasAnyCollectionItem && initialSelectedLanguage === 'all' && collectionLanguagesAvailable.size > 0) {
            // Rule 2: There are collection items, AND the filter is currently 'all', AND there are specific collection languages available
            // -> Default to the first available language from the collection.
            initialSelectedLanguage = Array.from(collectionLanguagesAvailable)[0];
            console.log(`Initial default: Setting language filter to first collection language: '${initialSelectedLanguage}'.`);
        } else if (hasAnyCollectionItem && initialSelectedLanguage !== 'all' && collectionLanguagesAvailable.size > 0 && !collectionLanguagesAvailable.has(initialSelectedLanguage.toLowerCase())) {
            // Rule 3: There are collection items, AND a specific language is currently selected,
            // BUT no collection items match that specific language AND other collection languages are available.
            // -> Default to the first available language from the collection.
            initialSelectedLanguage = Array.from(collectionLanguagesAvailable)[0];
            console.log(`Initial default: Adjusting language filter from existing '${languageFilter.value}' to first collection language: '${initialSelectedLanguage}' (no matching collection items).`);
        }
        // In all other cases, initialSelectedLanguage remains its current value.

        languageFilter.value = initialSelectedLanguage;
    })();

    // Adjust pagination size on screen resize
    mobileQuery.addEventListener('change', e => {
        ITEMS_PER_PAGE = e.matches ? 5 : 10;
        currentPage = 1; // Reset to first page on size change
        applyFiltersSearchSort(); // Re-apply all logic and render
    });

    // ──────────────────────────────
    // 📅 Utility to parse dates (prioritizes year, then full date)
    function parsePublishDate(dateString) {
        if (!dateString) {
            return null; // No date string, cannot parse
        }

        const yearMatch = dateString.match(/\b(\d{4})\b/);
        if (yearMatch) {
            return new Date(parseInt(yearMatch[1]), 0, 1); // January 1st of the year
        }

        try {
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) { // Check if date is valid
                return date;
            }
        } catch (e) {
            // Ignore parsing errors
        }

        return null; // Could not parse a valid date
    }

    // ──────────────────────────────
    // 🔄 Main pipeline: filter, search, sort, then render
    function applyFiltersSearchSort() {
        const searchTerm = editionSearchInput.value.toLowerCase().trim();
        const selectedLanguage = languageFilter.value.toLowerCase();
        const selectedSortOrder = sortOrderSelect.value;

        // Apply filtering and searching
        let filteredEditions = allWorkEditionsInitial.filter(edition => {
            const editionTitle = edition.title ? edition.title.toLowerCase() : '';
            const editionPublishDate = edition.publish_date ? edition.publish_date.toLowerCase() : '';
            const editionPublishers = (edition.publishers && Array.isArray(edition.publishers)) ?
                edition.publishers.map(p => p.toLowerCase()).join(' ') :
                '';
            const editionIsbn = (edition.isbn || 'Not Found').toLowerCase();
            const editionLanguages = (edition.languages && Array.isArray(edition.languages)) ?
                edition.languages.map(l => l.toLowerCase()) : [];

            const matchesSearch = (
                searchTerm === '' ||
                editionTitle.includes(searchTerm) ||
                editionPublishDate.includes(searchTerm) ||
                editionPublishers.includes(searchTerm) ||
                editionIsbn.includes(searchTerm)
            );

            const matchesLanguageFilter = (
                selectedLanguage === 'all' ||
                editionLanguages.includes(selectedLanguage)
            );

            return matchesSearch && matchesLanguageFilter;
        });

        // Apply sorting
        filteredEditions.sort((a, b) => {
            // 1. Prioritize editions in collection
            const aIsInCollection = a.isInCollection ? 1 : 0;
            const bIsInCollection = b.isInCollection ? 1 : 0;

            if (aIsInCollection !== bIsInCollection) {
                return bIsInCollection - aIsInCollection; // In collection first
            }

            // 2. Sort by publish date
            const dateA = parsePublishDate(a.publish_date);
            const dateB = parsePublishDate(b.publish_date);

            if (!dateA && !dateB) {
                return a.edition_olid.localeCompare(b.edition_olid); // Fallback to OLID if no dates
            }
            if (!dateA) return 1; // Editions with no date go to end
            if (!dateB) return -1; // Editions with date come first

            let comparison = dateA.getTime() - dateB.getTime();

            // 3. If dates are equal, sort by OLID for consistent order
            if (comparison === 0) {
                comparison = a.edition_olid.localeCompare(b.edition_olid);
            }

            // Apply sort order (descending for latest date first)
            if (selectedSortOrder === 'desc') {
                comparison *= -1;
            }
            return comparison;
        });

        currentFilteredAndSortedEditions = filteredEditions;
        currentPage = 1; // Always reset to page 1 after filter/search/sort
        renderPage(); // Render the first page of results
    }

    // ──────────────────────────────
    // 🎞️ Render current page of editions + update pagination controls
    function renderPage() {
        // Clear existing cards
        editionCardsContainer.innerHTML = '';

        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = currentFilteredAndSortedEditions.slice(start, start + ITEMS_PER_PAGE);

        // Display message if no matching editions
        if (pageItems.length === 0) {
            const existingMessage = document.getElementById('noMatchingEditionsMessage');
            if (!existingMessage) {
                const noEditionsMessage = document.createElement('p');
                noEditionsMessage.id = 'noMatchingEditionsMessage';
                noEditionsMessage.classList.add('no-results-message');

                noEditionsMessage.textContent = allWorkEditionsInitial.length === 0 ?
                    'No editions found for this work.' :
                    'No matching editions found for the current filters.';

                const editionsHeader = document.querySelector('.work-editions-header');
                if (editionsHeader) {
                    editionsHeader.insertAdjacentElement('afterend', noEditionsMessage);
                } else {
                    editionCardsContainer.appendChild(noEditionsMessage);
                }
            }
        } else {
            // Remove "No matching editions" message if it exists
            document.getElementById('noMatchingEditionsMessage')?.remove();

            // Dynamically create and append DOM elements for the current page's editions
            pageItems.forEach(edition => {
                const editionLinkCard = document.createElement('a');
                editionLinkCard.href = `/edition/${edition.edition_olid}`;
                editionLinkCard.classList.add('edition-link-card');

                const editionDiv = document.createElement('div');
                editionDiv.classList.add('work-edition-group', 'edition-item');
                editionDiv.dataset.editionOlid = edition.edition_olid;

                // Create image/cover div
                const floatLeftDiv = document.createElement('div');
                floatLeftDiv.classList.add('float-left');
                let coverHtml = '';
                if (edition.cover) {
                    coverHtml = `<img src="${edition.cover}" alt="${edition.title} Book Cover" class="work-edition-image">`;
                } else {
                    coverHtml = `
                        <div class="missing-cover-container">
                            <img src="/assets/images/book placeholder.webp" alt="${edition.title} Book Cover Image" class="no-cover work-edition-image">
                            <div class="missing-cover-overlay-s flex vertical align-center">
                                <p class="missing-cover-text-s"><i>(Cover unavailable)</i></p>
                            </div>
                        </div>
                    `;
                }
                floatLeftDiv.innerHTML = coverHtml;
                editionDiv.appendChild(floatLeftDiv);

                // Conditional rendering for "Add to Collection" / "In My Collection"
                if (typeof userLoggedIn !== 'undefined' && userLoggedIn) {
                    if (edition.isInCollection) {
                        const inCollectionBadge = document.createElement('div');
                        inCollectionBadge.classList.add('in-collection-badge', 'flex', 'align-center', 'justify-center');
                        inCollectionBadge.dataset.editionOlid = edition.edition_olid;
                        inCollectionBadge.innerHTML = `In My Collection <i class="bi bi-bookmark-check-fill add-books-icon"></i>`;
                        editionDiv.appendChild(inCollectionBadge);
                    } else {
                        const addBookButtonDiv = document.createElement('div');
                        addBookButtonDiv.classList.add('add-books-button', 'button', 'page-navigation-button', 'add-to-collection-btn');
                        addBookButtonDiv.dataset.editionOlid = edition.edition_olid;
                        addBookButtonDiv.innerHTML = `Add to My Collection<i class="bi bi-bookmark-plus-fill add-books-icon"></i>`;
                        editionDiv.appendChild(addBookButtonDiv);
                    }
                }

                // Add title
                const titleText = document.createElement('h3'); // Using h3 for semantic heading
                titleText.textContent = edition.title || 'Unknown Title';
                editionDiv.appendChild(titleText);

                // Add publisher and publish date
                const publisherParagraph = document.createElement('p');
                publisherParagraph.innerHTML = `<i>Publisher(s): ${edition.publishers || 'Unknown'} ${edition.publish_date || 'Unknown Date'}</i>`;
                editionDiv.appendChild(publisherParagraph);

                // Add ISBN and Languages
                const bottomRowDiv = document.createElement('div');
                bottomRowDiv.classList.add('flex', 'justify-between');

                const isbnParagraph = document.createElement('p');
                isbnParagraph.innerHTML = `<i>ISBN: ${edition.isbn || 'Not Found'}</i>`;
                bottomRowDiv.appendChild(isbnParagraph);

                const languagesParagraph = document.createElement('p');
                const languagesDisplay = (edition.languages && edition.languages.length > 0) ? edition.languages.join(', ') : 'Language Not Found';
                languagesParagraph.innerHTML = `<i>${languagesDisplay}</i>`;
                bottomRowDiv.appendChild(languagesParagraph);

                editionDiv.appendChild(bottomRowDiv);

                editionLinkCard.appendChild(editionDiv);
                editionCardsContainer.appendChild(editionLinkCard);
            });
            attachAddButtonListeners(); // Re-attach event listeners to newly created buttons
        }

        renderPaginationControls(currentFilteredAndSortedEditions.length); // Update pagination UI
    }

    // ──────────────────────────────
    // 🏷️ Set event listeners on “Add to Collection” buttons
    function attachAddButtonListeners() {
        const addButtons = document.querySelectorAll('.add-to-collection-btn');
        addButtons.forEach(button => {
            // Remove any existing listeners to prevent duplicates if renderPage is called multiple times
            button.removeEventListener('click', handleAddButtonClick);
            button.addEventListener('click', handleAddButtonClick);
        });
    }

    // ──────────────────────────────
    // ➕ Handle adding edition to collection
    async function handleAddButtonClick(event) {
        event.preventDefault(); // Prevent default link behavior if inside an <a> tag
        event.stopPropagation(); // Stop propagation to prevent parent link from being followed

        const button = event.currentTarget; // The button that was clicked
        const editionOlid = button.dataset.editionOlid;

        // Disable button to prevent multiple clicks and provide feedback
        button.disabled = true;
        button.style.opacity = '0.7';
        button.textContent = 'Adding...';

        let response; // Declare response outside try-catch for finally block access
        try {
            response = await fetch('/add-edition', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    edition_olid: editionOlid
                })
            });

            const data = await response.json();

            if (response.ok) {
                console.log(`Success adding edition ${editionOlid}:`, data.message);
                // Find the corresponding edition in the initial data array and update its status
                const editionToUpdate = allWorkEditionsInitial.find(e => e.edition_olid === editionOlid);
                if (editionToUpdate) {
                    editionToUpdate.isInCollection = true;
                }
                // Re-render the editions to show the updated status (badge instead of button)
                applyFiltersSearchSort(); // This will re-filter/sort and then render the current page
            } else {
                console.error(`Error adding edition ${editionOlid}:`, data.error);
                alert(`Error: ${data.error}`);
            }
        } catch (error) {
            console.error('Network or unexpected error:', error);
            alert('An unexpected error occurred. Please try again.');
        } finally {
            // Re-enable button on error, or it will be replaced by badge on success
            if (!response || !response.ok) {
                button.disabled = false;
                button.style.opacity = '1';
                button.innerHTML = `Add to My Collection<i class="bi bi-bookmark-plus-fill add-books-icon"></i>`; // Restore original text/icon
            }
        }
    }

    // ──────────────────────────────
    // 🔢 Pagination controls builder
    function renderPaginationControls(totalItems) {
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        paginationList.innerHTML = ''; // Clear existing pagination controls

        // --- MODIFICATION 1: Hide pagination if only one page or no results ---
        if (totalPages <= 1) {
            return; // Do not display pagination if there's only 0 or 1 page
        }

        const isMobile = mobileQuery.matches;
        const pageStep = isMobile ? 1 : 2; // Fewer page numbers on mobile

        // Helper to create and append pagination buttons/dots
        const createPaginationButton = (text, pageNumber, className = '') => {
            const listItem = document.createElement('li');
            listItem.textContent = text;
            listItem.className = className;
            if (!className.includes('disabled') && !className.includes('active') && text !== '...') {
                listItem.addEventListener('click', () => goToPage(pageNumber));
            }
            paginationList.appendChild(listItem);
        };

        // "Previous" button
        createPaginationButton('Prev', currentPage - 1, `btn${currentPage === 1 ? ' disabled' : ''}`);

        // Render page numbers
        // --- MODIFICATION 2: Adjust constant for fewer page numbers in condensed view ---
        if (totalPages <= pageStep * 2 + 4) { // If few pages, show all (changed from +6 to +4)
            for (let i = 1; i <= totalPages; i++) {
                createPaginationButton(i, i, `numb${i === currentPage ? ' active' : ''}`);
            }
        } else { // If many pages, show condensed view with dots
            if (currentPage > pageStep * 2 + 1) { // This part might need adjustment too based on new constant if you want tighter dot placement.
                // For simplicity, keeping this as is, but typically this constant should align with the main one.
                createPaginationButton(1, 1, 'numb');
                createPaginationButton('...', null, 'dots');
            }
            const minPage = Math.max(1, currentPage - pageStep);
            const maxPage = Math.min(totalPages, currentPage + pageStep);
            for (let i = minPage; i <= maxPage; i++) {
                createPaginationButton(i, i, `numb${i === currentPage ? ' active' : ''}`);
            }
            if (currentPage < totalPages - pageStep * 2) { // This also might need adjustment based on new constant.
                createPaginationButton('...', null, 'dots');
                createPaginationButton(totalPages, totalPages, 'numb');
            }
        }

        // "Next" button
        createPaginationButton('Next', currentPage + 1, `btn${currentPage === totalPages || totalPages === 0 ? ' disabled' : ''}`);
    }

    // ──────────────────────────────
    // ➡️ Navigate to a specific page
    function goToPage(page) {
        const totalPages = Math.ceil(currentFilteredAndSortedEditions.length / ITEMS_PER_PAGE);
        if (page < 1 || page > totalPages) return; // Prevent navigating out of bounds
        currentPage = page;
        renderPage(); // Render the new page
    }

    // ──────────────────────────────
    // ↩️ Back button functionality
    backButton?.addEventListener('click', e => {
        e.preventDefault();
        window.history.back(); // Go back in browser history
    });

    // ──────────────────────────────
    // 🚨 Handle session restores (BFCache) - force reload for fresh data
    window.addEventListener('pageshow', e => {
        if (e.persisted) {
            console.log('Page loaded from BFcache, forcing refresh...');
            window.location.reload();
        }
    });

    // ──────────────────────────────
    // 🏁 Initial kickoff: Apply filters/search/sort and render the first page
    languageFilter.addEventListener('change', applyFiltersSearchSort);
    editionSearchInput.addEventListener('input', applyFiltersSearchSort);
    sortOrderSelect.addEventListener('change', applyFiltersSearchSort);

    // Initial render when the page loads
    applyFiltersSearchSort();
});