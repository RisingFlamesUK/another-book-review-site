// public/js/work-editions-script.js

document.addEventListener('DOMContentLoaded', () => {
  const cardContainer = document.querySelector('.edition-card-holder');
  const allCards = Array.from(cardContainer.querySelectorAll('.work-edition-group'));

  const searchInput = document.getElementById('editionSearch');
  const languageSelect = document.getElementById('languageFilter');
  const sortSelect = document.getElementById('sortOrder');
  const paginationList = document.getElementById('pagination-list');

  let currentPage = 1;
  const cardsPerPage = 12;

  // Filters
  function filterAndSortCards() {
    const query = searchInput.value.trim().toLowerCase();
    const selectedLang = languageSelect.value;
    const sortOrder = sortSelect.value;

    let filtered = allCards.filter(card => {
      const text = card.textContent.toLowerCase();
      const langAttr = card.querySelector('p i:last-child')?.textContent.toLowerCase() || '';
      const langMatch = selectedLang === 'all' || langAttr.includes(selectedLang);
      return text.includes(query) && langMatch;
    });

    // Sort by publish date (ascending or descending)
    filtered.sort((a, b) => {
      const dateA = extractYear(a.textContent);
      const dateB = extractYear(b.textContent);
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    renderCards(filtered);
  }

  function extractYear(text) {
    const match = text.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0], 10) : 0;
  }

  function renderCards(cards) {
    const start = (currentPage - 1) * cardsPerPage;
    const end = start + cardsPerPage;
    const visibleCards = cards.slice(start, end);

    allCards.forEach(c => c.style.display = 'none');
    visibleCards.forEach(c => c.style.display = '');

    updatePagination(cards.length);
    lazyLoadVisibleCovers(visibleCards);
  }

  function updatePagination(totalCards) {
    const totalPages = Math.ceil(totalCards / cardsPerPage);
    paginationList.innerHTML = '';

    if (totalPages <= 1) {
      paginationList.style.display = 'none';
      return;
    }
    paginationList.style.display = '';

    for (let i = 1; i <= totalPages; i++) {
      const li = document.createElement('li');
      li.textContent = i;
      if (i === currentPage) li.classList.add('active');
      li.addEventListener('click', () => {
        currentPage = i;
        filterAndSortCards();
      });
      paginationList.appendChild(li);
    }
  }

  function lazyLoadVisibleCovers(visibleCards) {
    const coverContainers = visibleCards.map(card =>
      card.querySelector('.edition-image-container')
    ).filter(Boolean);

    const idsToFetch = coverContainers.map(el => el.dataset.coverId);
    if (idsToFetch.length === 0) return;

    fetch('/work/covers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: idsToFetch })
    })
      .then(res => res.json())
      .then(map => {
        coverContainers.forEach(container => {
          const id = container.dataset.coverId;
          const resolved = map[`https://covers.openlibrary.org/b/olid/${id}-S.jpg`];
          const img = container.querySelector('img');

          if (resolved && img) {
            img.src = resolved;
            img.classList.remove('no-cover');
          }
        });
      })
      .catch(err => console.error('Failed to fetch covers:', err));
  }

  // Setup listeners
  searchInput.addEventListener('input', () => {
    currentPage = 1;
    filterAndSortCards();
  });
  languageSelect.addEventListener('change', () => {
    currentPage = 1;
    filterAndSortCards();
  });
  sortSelect.addEventListener('change', () => {
    currentPage = 1;
    filterAndSortCards();
  });

  // Initial load
  filterAndSortCards();
});
