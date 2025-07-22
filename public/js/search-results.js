document.addEventListener('DOMContentLoaded', () => {
  const isMobile = window.matchMedia("(max-width: 800px)");
  let isSmallScreen = isMobile.matches;

  isMobile.addEventListener('change', e => {
    isSmallScreen = e.matches;
    renderPage(currentPage);
  });

  const dataEl = document.getElementById('search-cards-data');
  if (!dataEl) return;

  const cards = JSON.parse(dataEl.textContent);
  const grid = document.getElementById('search-results-grid');
  const paginationList = document.getElementById('pagination-list');
  const itemsPerPageDropdown = document.getElementById('itemsPerPageDropdown');

  let ITEMS_PER_PAGE = parseInt(itemsPerPageDropdown?.value) || 10;
  let currentPage = 1;

  itemsPerPageDropdown?.addEventListener('change', (e) => {
    ITEMS_PER_PAGE = parseInt(e.target.value);
    currentPage = 1;
    renderPage(1);
  });

  async function fetchCoversForPage(cardsOnPage) {
    const urls = cardsOnPage
      .map(c => c.cover_edition_key && `https://covers.openlibrary.org/b/olid/${c.cover_edition_key}-M.jpg`)
      .filter(Boolean);

    if (!urls.length) return {};
    const resp = await fetch('/search/covers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        urls
      })
    });
    return resp.ok ? resp.json() : {};
  }

  async function renderPage(page) {
    currentPage = page;
    const start = (page - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageCards = cards.slice(start, end);

    const covers = await fetchCoversForPage(pageCards);
    grid.innerHTML = pageCards.map(c => buildCardHTML(c, covers)).join('');
    updatePaginationControls();
  }

  function updatePaginationControls() {
  const totalPages = Math.ceil(cards.length / ITEMS_PER_PAGE);
  paginationList.innerHTML = '';

  const mkLi = (txt, onClick, cls = '') => {
    const li = document.createElement('li');
    li.textContent = txt;
    if (cls) li.className = cls;
    if (!cls.includes('disabled') && !cls.includes('active') && !cls.includes('dots')) {
      li.addEventListener('click', onClick);
    }
    paginationList.appendChild(li);
  };

  // Prev button
  mkLi('Prev', () => renderPage(currentPage - 1), currentPage === 1 ? 'btn disabled' : 'btn');

  let showBefore = isSmallScreen ? 1 : 2;
  let showAfter = isSmallScreen ? 1 : 2;

  // First page
  if (currentPage > showBefore + 1) {
    mkLi(1, () => renderPage(1), 'numb');
    mkLi('...', null, 'dots');
  }

  // Middle pages
  const startPg = Math.max(1, currentPage - showBefore);
  const endPg = Math.min(totalPages, currentPage + showAfter);
  for (let i = startPg; i <= endPg; i++) {
    mkLi(i, () => renderPage(i), `numb${i === currentPage ? ' active' : ''}`);
  }

  // Last page
  if (currentPage < totalPages - showAfter) {
    mkLi('...', null, 'dots');
    mkLi(totalPages, () => renderPage(totalPages), 'numb');
  }

  // Next button
  mkLi('Next', () => renderPage(currentPage + 1), currentPage === totalPages ? 'btn disabled' : 'btn');
}

  function buildCardHTML(card, covers = {}) {
    const {
      work_olid,
      title = 'Untitled',
      author_names = [],
      first_publish_date = '',
      workscore
    } = card;

    const remoteCoverUrl = card.cover_edition_key ?
      `https://covers.openlibrary.org/b/olid/${card.cover_edition_key}-M.jpg` :
      null;
    const cover_url = remoteCoverUrl && covers[remoteCoverUrl] ? covers[remoteCoverUrl] : null;

    const authorStr = author_names.join(', ');
    const scoreHTML = workscore?.averageScore ? workscoreToStars(workscore.averageScore) : '';
    const encodedCover = encodeURIComponent(cover_url || '');
    const esc = str => String(str).replace(/[&<>'"]/g, t => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    } [t]));

    const coverSection = cover_url ?
      `<div class="search-card-img flex vertical justify-start align-center">
         <img src="${cover_url}" alt="${esc(title)} Book Cover Image">
       </div>` :
      `<div class="missing-cover-container search-card-img flex vertical justify-start align-center">
         <img src="/assets/images/book placeholder.webp" alt="${esc(title)} Book Cover Image">
         <div class="missing-cover-overlay flex vertical align-center">
           <p class="missing-cover-title">${esc(title)}</p>
           <p class="missing-cover-text"><i>(Cover unavailable)</i></p>
         </div>
       </div>`;

    return `
    <a class="search-card-link" href="/works/prepare/${work_olid}?cover_url=${encodedCover}">
      <div class="search-card work-card flex vertical align-center">
        <div class="book-title-hover-box flex vertical justify-center align-center">
          <div class="book-title-hover-text">${esc(title)}</div>
        </div>
        <div class="search-card-cover flex justify-center">
          ${coverSection}
          <div class="search-work-score">${scoreHTML}</div>
        </div>
        <div class="search-card-text-box">
          <p class="search-card-title"><b>${esc(title)}</b></p>
          <p class="search-card-author">${esc(authorStr)}</p>
          ${first_publish_date
            ? `<p class="search-card-publication">First Published: ${esc(first_publish_date)}</p>`
            : ''
          }
        </div>

      </div>
    </a>`;
  }

  function workscoreToStars(score) {
    const full = Math.round(score);
    return `<span class="star-score">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
  }

  renderPage(1);
});