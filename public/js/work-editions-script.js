// public/js/work-editions-script.js
document.addEventListener('DOMContentLoaded', () => {
  const editionCardsContainer = document.querySelector('.edition-card-holder');
  const paginationList = document.getElementById('pagination-list');
  const languageFilter = document.getElementById('languageFilter');
  const editionSearchInput = document.getElementById('editionSearch');
  const sortOrderSelect = document.getElementById('sortOrder');

  const mobileQuery = window.matchMedia('(max-width:800px)');
  let ITEMS_PER_PAGE = mobileQuery.matches ? 5 : 10;
  let currentPage = 1;

  const allWorkEditionsInitial = allWorkEditions;
  let currentFilteredAndSortedEditions = [...allWorkEditionsInitial];

  // Language selector default logic
  (() => {
    const hasCollection = allWorkEditionsInitial.some(e => e.isInCollection);
    const collectionLangs = new Set();

    if (hasCollection) {
      allWorkEditionsInitial
        .filter(e => e.isInCollection && Array.isArray(e.languages))
        .forEach(e => e.languages.forEach(l => {
          const lc = l.toLowerCase();
          if (lc !== 'language not found') collectionLangs.add(lc);
        }));
    }

    let selected = languageFilter.value;

    if (!hasCollection && selected === 'all') {
      selected = 'english';
    } else if (
      hasCollection &&
      selected === 'all' &&
      collectionLangs.size > 0
    ) {
      selected = [...collectionLangs][0];
    } else if (
      hasCollection &&
      selected !== 'all' &&
      !collectionLangs.has(selected.toLowerCase())
    ) {
      selected = [...collectionLangs][0];
    }

    languageFilter.value = selected;
  })();

  mobileQuery.addEventListener('change', e => {
    ITEMS_PER_PAGE = e.matches ? 5 : 10;
    currentPage = 1;
    applyFiltersSearchSort();
  });

  function parsePublishDate(dateStr) {
    const year = dateStr?.match(/\b(\d{4})\b/);
    if (year) return new Date(parseInt(year[1]), 0, 1);
    const fallback = new Date(dateStr);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  function applyFiltersSearchSort() {
    const search = editionSearchInput.value.toLowerCase().trim();
    const lang = languageFilter.value.toLowerCase();
    const sort = sortOrderSelect.value;

    const filtered = allWorkEditionsInitial.filter(e => {
      const title = e.title?.toLowerCase() || '';
      const date = e.publish_date?.toLowerCase() || '';
      const publishers = Array.isArray(e.publishers) ?
        e.publishers.join(' ').toLowerCase() :
        '';
      const isbn = e.isbn?.toLowerCase() || 'not found';
      const langs = Array.isArray(e.languages) ?
        e.languages.map(l => l.toLowerCase()) : [];

      const matchesSearch = !search ||
        title.includes(search) ||
        date.includes(search) ||
        publishers.includes(search) ||
        isbn.includes(search);

      const matchesLang = lang === 'all' || langs.includes(lang);

      return matchesSearch && matchesLang;
    });

    filtered.sort((a, b) => {
      const aCol = a.isInCollection ? 1 : 0;
      const bCol = b.isInCollection ? 1 : 0;
      if (aCol !== bCol) return bCol - aCol;

      const aDate = parsePublishDate(a.publish_date);
      const bDate = parsePublishDate(b.publish_date);

      if (!aDate && !bDate) return a.edition_olid.localeCompare(b.edition_olid);
      if (!aDate) return 1;
      if (!bDate) return -1;

      let cmp = aDate - bDate;
      if (cmp === 0) cmp = a.edition_olid.localeCompare(b.edition_olid);
      return sort === 'desc' ? -cmp : cmp;
    });

    currentFilteredAndSortedEditions = filtered;
    currentPage = 1;
    renderPage();
  }

  function renderPage() {
    editionCardsContainer.innerHTML = '';

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = currentFilteredAndSortedEditions.slice(start, start + ITEMS_PER_PAGE);

    if (pageItems.length === 0) {
      const msg = document.createElement('p');
      msg.id = 'noMatchingEditionsMessage';
      msg.className = 'no-results-message';
      msg.textContent =
        allWorkEditionsInitial.length === 0 ?
        'No editions found for this work.' :
        'No matching editions found for the current filters.';
      editionCardsContainer.appendChild(msg);
      paginationList.classList.add('invisible');
      return;
    }

    document.getElementById('noMatchingEditionsMessage')?.remove();

    const imageContainers = [];

    pageItems.forEach(edition => {
      const card = document.createElement('a');
      card.href = `/edition/${edition.edition_olid}`;
      card.className = 'edition-link-card';

      const outer = document.createElement('div');
      outer.className = 'work-edition-group edition-item';
      outer.dataset.editionOlid = edition.edition_olid;

      const floatLeft = document.createElement('div');
      floatLeft.className = 'float-left';

      const identifier = String(edition.cover_identifier);

      if (edition.cover_identifier) {
        const container = document.createElement('div');
        container.className = 'edition-image-container';
        container.dataset.coverId = identifier;

        const img = document.createElement('img');
        img.src = '/assets/images/book placeholder.webp';
        img.alt = `${edition.title} Cover Placeholder`;
        img.className = 'no-cover work-edition-image';

        container.appendChild(img);
        floatLeft.appendChild(container);
        imageContainers.push(container);
      }

      outer.appendChild(floatLeft);

      // In Collection logic
      if (userLoggedIn) {
        if (edition.isInCollection) {
          const badge = document.createElement('div');
          badge.className = 'in-collection-badge flex align-center justify-center';
          badge.dataset.editionOlid = edition.edition_olid;
          badge.innerHTML = 'In My Collection <i class="bi bi-bookmark-check-fill add-books-icon"></i>';
          outer.appendChild(badge);
        } else {
          const button = document.createElement('div');
          button.className = 'add-books-button button page-navigation-button add-to-collection-btn';
          button.dataset.editionOlid = edition.edition_olid;
          button.innerHTML = 'Add to My Collection<i class="bi bi-bookmark-plus-fill add-books-icon"></i>';
          outer.appendChild(button);
        }
      }

      const h3 = document.createElement('h3');
      h3.textContent = edition.title || 'Unknown Title';
      outer.appendChild(h3);

      const pub = document.createElement('p');
      pub.innerHTML = `<i>Publisher(s): ${edition.publishers || 'Unknown'} ${edition.publish_date || 'Unknown Date'}</i>`;
      outer.appendChild(pub);

      const flex = document.createElement('div');
      flex.className = 'flex justify-between';
      flex.innerHTML = `
        <p><i>ISBN: ${edition.isbn || 'Not Found'}</i></p>
        <p><i>${(edition.languages || ['Language Not Found']).join(', ')}</i></p>
`;
      outer.appendChild(flex);

      card.appendChild(outer);
      editionCardsContainer.appendChild(card);
    });

    lazyLoadVisibleCovers(imageContainers);
    attachAddButtonListeners();
    renderPaginationControls(currentFilteredAndSortedEditions.length);
  }

  function lazyLoadVisibleCovers(containers) {
    const ids = containers.map(c => c.dataset.coverId);
    if (!ids.length) return;

    fetch('/work/covers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          urls: ids
        })
      })
      .then(r => r.json())
      .then(map => {
        containers.forEach(c => {
          const id = c.dataset.coverId;
          const img = c.querySelector('img');
          if (!img) return;

          // Find matching key by checking if it ends in `/${id}-S.jpg`
          const matchedKey = Object.keys(map).find(k => k.endsWith(`/${id}-S.jpg`));
          if (matchedKey) {
            img.src = map[matchedKey];
            img.classList.remove('no-cover');
          } else {
            const container = img.closest('.edition-image-container');
            if (container && !container.querySelector('.missing-cover-overlay-s')) {
              const overlay = document.createElement('div');
              overlay.className = 'missing-cover-overlay-s flex vertical align-center';

              const text = document.createElement('p');
              text.className = 'missing-cover-text-s';
              text.innerHTML = '<i>(Cover unavailable)</i>';
              overlay.appendChild(text);

              container.appendChild(overlay);
              container.classList.add('missing-cover-container');
            }
          }
        });
      })
      .catch(e => console.error('Cover fetch failed:', e));
  }

  function attachAddButtonListeners() {
    const addButtons = document.querySelectorAll('.add-to-collection-btn');
    addButtons.forEach(button => {
      button.removeEventListener('click', handleAddButtonClick);
      button.addEventListener('click', handleAddButtonClick);
    });
  }

  async function handleAddButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const editionOlid = button.dataset.editionOlid;
    button.disabled = true;
    button.style.opacity = '0.7';
    button.textContent = 'Adding...';

    let response;
    try {
      response = await fetch('/add-edition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edition_olid: editionOlid })
      });

      const data = await response.json();

      if (response.ok) {
        const updated = allWorkEditionsInitial.find(e => e.edition_olid === editionOlid);
        if (updated) updated.isInCollection = true;
        applyFiltersSearchSort();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      alert('An unexpected error occurred.');
    } finally {
      if (!response || !response.ok) {
        button.disabled = false;
        button.style.opacity = '1';
        button.innerHTML = 'Add to My Collection<i class="bi bi-bookmark-plus-fill add-books-icon"></i>';
      }
    }
  }
  
  function renderPaginationControls(totalItems) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    paginationList.innerHTML = '';
    if (totalPages <= 1) {
      paginationList.classList.add('invisible');
      return;
    }
    paginationList.classList.remove('invisible');

    for (let i = 1; i <= totalPages; i++) {
      const li = document.createElement('li');
      li.textContent = i;
      li.className = i === currentPage ? 'active' : '';
      li.addEventListener('click', () => {
        currentPage = i;
        renderPage();
      });
      paginationList.appendChild(li);
    }
  }

  languageFilter.addEventListener('change', applyFiltersSearchSort);
  editionSearchInput.addEventListener('input', applyFiltersSearchSort);
  sortOrderSelect.addEventListener('change', applyFiltersSearchSort);

  applyFiltersSearchSort();
});