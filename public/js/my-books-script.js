// public/js/my-books-script.js
document.addEventListener('DOMContentLoaded', () => {
    const bookCardsContainer = document.querySelector('.card-holder-cards');
    const searchInput = document.getElementById('bookSearch');
    const statusFilter = document.getElementById('statusFilter');
    const itemsPerPageDropdown = document.getElementById('itemsPerPageDropdown');
    const paginationList = document.getElementById('pagination-list');

    let ITEMS_PER_PAGE = parseInt(itemsPerPageDropdown.value, 10);
    let currentPage = 1;
    let filteredCardForms = [];
    const allBookCardForms = Array.from(bookCardsContainer.querySelectorAll('.card-form'));

    const applyFiltersAndSearch = () => {
        const term = searchInput.value.toLowerCase().trim();
        const status = statusFilter.value;

        filteredCardForms = allBookCardForms.filter(form => {
            const cont = form.querySelector('.card-container');
            if (!cont) return false;
            const title = (cont.dataset.title || '').toLowerCase();
            const authors = (cont.dataset.authors || '').toLowerCase();
            const statusId = cont.dataset.statusId;
            const matches = (term === '' || title.includes(term) || authors.includes(term)) &&
                (status === 'all' || status === statusId);
            return matches;
        });

        currentPage = 1;
        renderCurrentPage();
    };

    const renderCurrentPage = () => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageForms = filteredCardForms.slice(start, start + ITEMS_PER_PAGE);

        allBookCardForms.forEach(f => {
            f.classList.toggle('visible', pageForms.includes(f));
            f.classList.toggle('invisible', !pageForms.includes(f));
        });

        if (pageForms.length === 0 && allBookCardForms.length > 0 && !document.getElementById('noMatchingBooksMessage')) {
            const p = document.createElement('p');
            p.id = 'noMatchingBooksMessage';
            p.classList.add('no-results-message');
            p.textContent = filteredCardForms.length === 0 ?
                'No books found in your library. Please add books to see them here.' :
                'No matching books found.';
            bookCardsContainer.appendChild(p);
        } else {
            const msg = document.getElementById('noMatchingBooksMessage');
            if (msg) msg.remove();
        }

        updatePaginationControls();
    };

    const updatePaginationControls = () => {
        const totalPages = Math.ceil(filteredCardForms.length / ITEMS_PER_PAGE);
        const step = 2;
        paginationList.innerHTML = '';

        const mkLi = (text, handler, cls = '') => {
            const li = document.createElement('li');
            li.textContent = text;
            li.className = cls;
            if (!cls.includes('disabled') && !cls.includes('dots') && handler) {
                li.addEventListener('click', handler);
            }
            paginationList.appendChild(li);
        };

        // Prev
        mkLi('Prev', () => renderCurrentPage(--currentPage), currentPage === 1 ? 'btn disabled' : 'btn');

        // Page numbers
        if (totalPages <= step * 2 + 6) {
            for (let i = 1; i <= totalPages; i++) {
                mkLi(i, () => renderCurrentPage(currentPage = i), `numb${i === currentPage ? ' active' : ''}`);
            }
        } else {
            if (currentPage > step * 2 + 1) {
                mkLi(1, () => renderCurrentPage(1), 'numb');
                mkLi('...', null, 'dots');
            }
            const min = Math.max(1, currentPage - step);
            const max = Math.min(totalPages, currentPage + step);
            for (let i = min; i <= max; i++) {
                mkLi(i, () => renderCurrentPage(currentPage = i), `numb${i === currentPage ? ' active' : ''}`);
            }
            if (currentPage < totalPages - step * 2) {
                mkLi('...', null, 'dots');
                mkLi(totalPages, () => renderCurrentPage(currentPage = totalPages), 'numb');
            }
        }

        // Next
        mkLi('Next', () => renderCurrentPage(++currentPage),
            currentPage === totalPages || totalPages === 0 ? 'btn disabled' : 'btn');
    };

    // Event bindings
    searchInput.addEventListener('input', applyFiltersAndSearch);
    statusFilter.addEventListener('change', applyFiltersAndSearch);
    itemsPerPageDropdown.addEventListener('change', (ev) => {
        ITEMS_PER_PAGE = parseInt(ev.target.value, 10);
        currentPage = 1;
        renderCurrentPage();
    });

    // Keyboard and card click navigations
    allBookCardForms.forEach(form => {
        const cont = form.querySelector('.card-container');
        if (!cont) return;

        cont.addEventListener('click', () => {
            window.location.href = `/edition/${cont.dataset.editionOlid}`;
        });
        cont.addEventListener('keypress', ev => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                cont.click();
            }
        });
    });

    applyFiltersAndSearch(); // initial display
});