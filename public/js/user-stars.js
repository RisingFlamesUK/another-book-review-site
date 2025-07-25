// public/js/user-stars.js

// === STAR RENDERING HELPERS ===

// Render static star HTML from numeric score (for average display)
const clientScoreToStars = (score) => {
  const starScore = Math.round(score || 0);
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    stars += `<i class="bi ${i <= starScore ? 'bi-star-fill' : 'bi-star'}"></i>`;
  }
  return stars;
};

// Render suffix text for average score
const clientProcessScore = (score) => {
  if (score === null || score === '') {
    return '<span class="star-suffix"><i>&nbsp;(Not reviewed)</i></span>';
  }
  return `<span class="work-score">(${score})</span>`;
};

// Render interactive stars for a user rating (with data-value for each star)
const renderUserStarsHtml = (scoreToDisplay) => {
  const roundedScore = Math.round(scoreToDisplay || 0);
  let starsHtml = '';
  for (let i = 1; i <= 5; i++) {
    const className = `user-star bi ${i <= roundedScore ? 'bi-star-fill' : 'bi-star'}`;
    starsHtml += `<i class="${className}" data-value="${i}"></i>`;
  }
  return starsHtml;
};

// Render the complete user star HTML with optional suffix
const renderCompleteUserStarsHtml = (score) => {
  const starsHtml = renderUserStarsHtml(score);
  const prefix = '';
  const suffix = score === 0 ? '<span class="star-suffix">(Not reviewed)</span>' : '';
  return `${prefix}${starsHtml}${suffix}`;
};

// === WORK SCORE DISPLAY ===

// Update a paragraph element with the overall average score and review count
window.updateWorkScoreDisplay = (paragraphEl, totalScore, reviewCount) => {
  const avg = reviewCount > 0 ? (totalScore / reviewCount).toFixed(1) : '0.0';
  const starsHtml = clientScoreToStars(avg);
  const scoreHtml = clientProcessScore(avg);
  const reviewText = reviewCount === 1 ? 'review' : 'reviews';
  const countText = reviewCount != null ? `(${reviewCount} ${reviewText})` : '';
  paragraphEl.innerHTML = `Overall: &nbsp; ${starsHtml} ${scoreHtml}<span class="star-suffix"><i>${countText}</i></span>`;
};

// === USER STAR INTERACTION LOGIC ===

// Initialize user star interaction (hover, click, preview)
window.initializeUserStars = (container) => {
  const originalScore = parseFloat(container.dataset.originalScore) || 0;

  const updatePreview = (score) => {
    container.innerHTML = renderCompleteUserStarsHtml(score);
  };

  updatePreview(originalScore);

  // === Clean up old listeners if reinitializing ===
  ['mouseover', 'mouseout', 'click'].forEach(evt => {
    container.removeEventListener(evt, container[`__${evt}Handler__`]);
  });

  // === Mouseover: preview score ===
  const handleMouseOver = (e) => {
    const star = e.target.closest('.user-star');
    if (!star) return;
    const val = parseInt(star.dataset.value, 10);
    Array.from(container.querySelectorAll('.user-star')).forEach(el => {
      const v = parseInt(el.dataset.value, 10);
      el.classList.remove('bi-star-fill', 'bi-star');
      el.classList.add(v <= val ? 'bi-star-fill' : 'bi-star');
      el.style.border = '1px dashed rgba(255,231,12,0.5)';
    });
  };

  // === Mouseout: restore original score ===
  const handleMouseOut = () => {
    const updatedScore = parseFloat(container.dataset.originalScore) || 0;
    Array.from(container.querySelectorAll('.user-star')).forEach(el => {
      const v = parseInt(el.dataset.value, 10);
      el.classList.remove('bi-star-fill', 'bi-star');
      el.classList.add(v <= updatedScore ? 'bi-star-fill' : 'bi-star');
      el.style.border = 'none';
    });
  };

  // === Click: submit new score ===
  const handleClick = async (e) => {
    const clickedStar = e.target.closest('.user-star');
    if (!clickedStar) return;

    e.preventDefault();
    e.stopPropagation();

    const newScore = parseInt(clickedStar.dataset.value, 10);
    const wrapper = clickedStar.closest('.user-rating-wrapper');
    if (!wrapper) return alert('Could not find context.');

    const {
      editionOlid,
      workOlid
    } = wrapper.dataset;

    try {
      const resp = await fetch('/set-user-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          edition_olid: editionOlid,
          work_olid: workOlid,
          score: newScore
        })
      });

      const body = await resp.json();

      if (body.newUserReviewId) {
        window.userReviewId = body.newUserReviewId;
      }

      if (!resp.ok || !body.success) {
        if (resp.status === 401) {
          alert('Please log in to rate.');
          window.location = '/login';
        } else {
          throw new Error(body.message || 'Failed to update rating');
        }
        return;
      }

      // === Update Main Edition Page Score ===
      const fullEditionSection = document.getElementById('edition-work-score');
      if (fullEditionSection) {
        const p = fullEditionSection.querySelector('p');
        if (p) window.updateWorkScoreDisplay(p, body.newWorkScore, body.newWorkReviewCount);
      }

      // === Update All Relevant User Rating Wrappers ===
      document.querySelectorAll(`.user-rating-wrapper[data-edition-olid="${editionOlid}"]`).forEach(userWrapper => {
        const starsContainer = userWrapper.querySelector('.user-stars-container');
        if (starsContainer) {
          starsContainer.dataset.originalScore = body.newUserScore;
          starsContainer.innerHTML = renderCompleteUserStarsHtml(body.newUserScore);
          window.initializeUserStars(starsContainer); // reattach handlers
        }

        const cardContainer = userWrapper.closest('.card-container');
        if (cardContainer) {
          const workScoreP = cardContainer.querySelector('.work-score-section p');
          if (workScoreP) {
            window.updateWorkScoreDisplay(workScoreP, body.newWorkScore, body.newWorkReviewCount);
          }
        }
      });

      // === Refresh Review Section (on edition.ejs) ===
      window.refreshUserReviewSection?.();

    } catch (err) {
      console.error(err);
      alert('Error submitting rating. Refresh and try again.');
    }
  };

  // === Attach Event Listeners ===
  container.addEventListener('mouseover', handleMouseOver);
  container.addEventListener('mouseout', handleMouseOut);
  container.addEventListener('click', handleClick);

  container.__mouseoverHandler__ = handleMouseOver;
  container.__mouseoutHandler__ = handleMouseOut;
  container.__clickHandler__ = handleClick;
};

// === ON DOM READY: Initialize All Star Blocks ===
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.user-stars-container').forEach(el => {
    window.initializeUserStars(el);
  });
});