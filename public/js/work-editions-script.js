// This file is js/work-editions-script.js

/* global allWorkEditions */ // This is a hint for linting/IDE, confirming it's a global var

document.addEventListener('DOMContentLoaded', () => {

    const backButton = document.getElementById('backButton');

    // allWorkEditions is passed from the EJS template containing all edition data
    const allWorkEditionsInitial = allWorkEditions;
    let currentFilteredAndSortedEditions = [...allWorkEditionsInitial];

    // Get references to all individual edition DOM elements that represent a card
    // The selector now targets the 'edition-item' class on the 'div.work-edition-group'
    const editionCardsContainer = document.querySelector('.edition-card-holder');
    const allEditionDomElements = Array.from(editionCardsContainer.querySelectorAll('.edition-item'));

    // Create a map from edition_olid to its DOM element for efficient lookup
    const editionDomMap = new Map();
    allEditionDomElements.forEach(el => {
        editionDomMap.set(el.dataset.editionOlid, el);
    });

    // Get filter and search elements
    const languageFilter = document.getElementById('languageFilter');
    const editionSearchInput = document.getElementById('editionSearch');
    const sortOrderSelect = document.getElementById('sortOrder');
    const hasAnyCollectionItem = allWorkEditionsInitial.some(e => e.isInCollection);
    const collectionLanguagesAvailable = new Set();

    // Populate collectionLanguagesAvailable if there are any collection items
    if (hasAnyCollectionItem) {
        allWorkEditionsInitial.forEach(edition => {
            if (edition.isInCollection && edition.languages && edition.languages.length > 0) {
                edition.languages.forEach(lang => {
                    const lowerCaseLang = lang.toLowerCase();
                    if (lowerCaseLang !== 'language not found') {
                        collectionLanguagesAvailable.add(lowerCaseLang);
                    }
                });
            }
        });
    }
    // Determine the initial selected language
    let initialSelectedLanguage = languageFilter.value;

    if (!hasAnyCollectionItem && initialSelectedLanguage === 'all') {
        // Rule 1: No collection items at all, AND the filter is currently set to 'all'
        // -> Default to 'english'.
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
    // In all other cases (e.g., a specific language is already selected and has matching collection items, or no collection items but filter is already on a specific language),
    // initialSelectedLanguage will remain as its current value.

    // Apply the determined initial language to the UI element
    languageFilter.value = initialSelectedLanguage;


    function parsePublishDate(dateString) {
        // Attempt to parse various date formats. Prioritize year, then month, then day.
        // Example formats: "1999", "March 1, 1999", "1999-03-01"

        if (!dateString) {
            return null; // No date string, cannot parse
        }

        const yearMatch = dateString.match(/\b(\d{4})\b/);
        if (yearMatch) {
            const year = parseInt(yearMatch[1]);
            // We'll create a Date object at the start of the year for comparison.
            return new Date(year, 0, 1); // January 1st of the year
        }

        // Fallback for more complex date strings
        try {
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) { // Check if date is valid
                return date;
            }
        } catch (e) {
            // Ignore parsing errors, return null
        }

        return null; // Could not parse a valid date
    }

    function applyFiltersAndSearchAndSort() {
        const searchTerm = editionSearchInput.value.toLowerCase().trim();
        // IMPORTANT: Now we directly use languageFilter.value as it's already set correctly
        let selectedLanguage = languageFilter.value;
        const selectedSortOrder = sortOrderSelect.value;

        // No more logic here to modify `selectedLanguage` based on collection items
        // That logic now happens once on DOMContentLoaded

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
                editionLanguages.includes(selectedLanguage.toLowerCase())
            );

            return matchesSearch && matchesLanguageFilter;
        });

        // Apply sorting to the filtered editions
        filteredEditions.sort((a, b) => {
            // 1. Prioritize editions in collection
            const aIsInCollection = a.isInCollection ? 1 : 0;
            const bIsInCollection = b.isInCollection ? 1 : 0;

            if (aIsInCollection !== bIsInCollection) {
                return bIsInCollection - aIsInCollection;
            }

            const dateA = parsePublishDate(a.publish_date);
            const dateB = parsePublishDate(b.publish_date);

            if (!dateA && !dateB) {
                return a.edition_olid.localeCompare(b.edition_olid);
            }
            if (!dateA) return 1;
            if (!dateB) return -1;

            let comparison = dateA.getTime() - dateB.getTime();

            if (comparison === 0) {
                comparison = a.edition_olid.localeCompare(b.edition_olid);
            }

            if (selectedSortOrder === 'desc') {
                comparison *= -1;
            }
            return comparison;
        });

        currentFilteredAndSortedEditions = filteredEditions;
        renderFilteredEditions(currentFilteredAndSortedEditions);
    }


    function renderFilteredEditions(filteredAndSortedEditions) {
        let visibleCount = 0;

        // Clear existing cards
        editionCardsContainer.innerHTML = '';

        if (filteredAndSortedEditions.length === 0) {
            // Handle "No matching editions" message directly here
            const existingMessage = document.getElementById('noMatchingEditionsMessage');
            if (!existingMessage) {
                const noEditionsMessage = document.createElement('p');
                noEditionsMessage.id = 'noMatchingEditionsMessage';
                noEditionsMessage.classList.add('no-results-message');

                if (allWorkEditionsInitial.length === 0) { // Check against original data for initial message
                    noEditionsMessage.textContent = 'No editions found for this work.';
                } else {
                    noEditionsMessage.textContent = 'No matching editions found for the current filters.';
                }

                const editionsHeader = document.querySelector('.work-editions-header');
                if (editionsHeader) {
                    editionsHeader.insertAdjacentElement('afterend', noEditionsMessage);
                } else {
                    editionCardsContainer.appendChild(noEditionsMessage);
                }
            }
        } else {
            // Remove "No matching editions" message if it exists
            const existingMessage = document.getElementById('noMatchingEditionsMessage');
            if (existingMessage) {
                existingMessage.remove();
            }

            // Dynamically create and append DOM elements for the filtered and sorted editions
            filteredAndSortedEditions.forEach(edition => {
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

                // Add title
                const titleText = document.createTextNode(edition.title || 'Unknown Title');
                editionDiv.appendChild(titleText);

                // Add publisher and publish date
                const publisherParagraph = document.createElement('p');
                publisherParagraph.innerHTML = `<i>Publisher(s): ${edition.publishers || 'Unknown'} ${edition.publish_date || 'Unknown Date'}</i>`;
                editionDiv.appendChild(publisherParagraph);

                // Conditional rendering for "Add to Collection" / "In My Collection"
                if (userLoggedIn) {
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

                // Add ISBN and Languages
                const bottomRowDiv = document.createElement('div');
                bottomRowDiv.classList.add('flex', 'justify-between');

                const isbnParagraph = document.createElement('p');
                isbnParagraph.innerHTML = `<i>ISBN: ${edition.isbn || 'Not Found'}</i>`;
                bottomRowDiv.appendChild(isbnParagraph);

                const languagesParagraph = document.createElement('p');
                let languagesDisplay = (edition.languages && edition.languages.length > 0) ? edition.languages.join(', ') : 'Language Not Found';
                languagesParagraph.innerHTML = `<i>${languagesDisplay}</i>`;
                bottomRowDiv.appendChild(languagesParagraph);

                editionDiv.appendChild(bottomRowDiv);

                editionLinkCard.appendChild(editionDiv);
                editionCardsContainer.appendChild(editionLinkCard);
                visibleCount++; // This is effectively the count of rendered items
            });
        }
        // After rendering, re-attach event listeners to newly created buttons
        attachAddButtonListeners();
    }

    function attachAddButtonListeners() {
        const addButtons = document.querySelectorAll('.add-to-collection-btn');
        addButtons.forEach(button => {
            // Remove any existing listeners to prevent duplicates if renderFilteredEditions is called multiple times
            button.removeEventListener('click', handleAddButtonClick);
            button.addEventListener('click', handleAddButtonClick);
        });
    }

    async function handleAddButtonClick(event) {
        event.preventDefault(); // Prevent the default link behavior if inside an <a> tag
        event.stopPropagation(); // Stop propagation to prevent parent link from being followed

        const button = event.currentTarget; // The button that was clicked
        const editionOlid = button.dataset.editionOlid;

        // Disable button to prevent multiple clicks
        button.disabled = true;
        button.style.opacity = '0.7';
        button.textContent = 'Adding...'; // Provide feedback

        try {
            const response = await fetch('/add-edition', {
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
                applyFiltersAndSearchAndSort(); // This will re-render all filtered/sorted editions
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
                button.innerHTML = `Add to my Collection<i class="bi bi-bookmark-plus-fill add-books-icon"></i>`; // Restore original text/icon
            }
        }
    }

    // Add event listeners for filter and search input changes
    languageFilter.addEventListener('change', applyFiltersAndSearchAndSort);
    editionSearchInput.addEventListener('input', applyFiltersAndSearchAndSort);
    sortOrderSelect.addEventListener('change', applyFiltersAndSearchAndSort);

    // Initial render when the page loads
    applyFiltersAndSearchAndSort();

    if (backButton) {
        backButton.addEventListener('click', (event) => {
            event.preventDefault(); // Prevent default link behavior
            console.log('Going back in history...');
            window.history.back(); // Simply go back one step
        });
    }
    // This listener is crucial for detecting when a page is loaded from BFcache
    window.addEventListener('pageshow', (event) => {
        // Check if the page was loaded from the browser's cache
        if (event.persisted) {
            // If it was, force a reload to get fresh data
            console.log('Page loaded from BFcache, forcing refresh...');
            window.location.reload();
        }
    });
});