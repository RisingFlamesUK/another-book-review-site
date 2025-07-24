// This file is public/js/user-stars.js

const clientScoreToStars = (score) => {
  const starScore = Math.round(score || 0);
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    stars += `<i class="bi ${i <= starScore ? 'bi-star-fill' : 'bi-star'}"></i>`;
  }
  return stars;
};

const clientProcessScore = (score) => {
  if (score === null || score === '') {
    return '<span class="star-suffix"><i>&nbsp;(Not reviewed)</i></span>';
  }
  return `<span class="work-score">(${score})</span>`;
};

const renderUserStarsHtml = (scoreToDisplay) => {
  const roundedScore = Math.round(scoreToDisplay || 0);
  let starsHtml = '';
  for (let i = 1; i <= 5; i++) {
    const className = `user-star bi ${i <= roundedScore ? 'bi-star-fill' : 'bi-star'}`;
    starsHtml += `<i class="${className}" data-value="${i}"></i>`;
  }
  return starsHtml;
};

// Helper: full HTML with prefix/suffix
const renderCompleteUserStarsHtml = (score) => {
  const starsHtml = renderUserStarsHtml(score);
  // const prefix = score === 0 ? 'Score Now: ' : '';
  const prefix = '';
  const suffix = score === 0 ? '<span class="star-suffix">(Not reviewed)</span>' : '';
  return `${prefix}${starsHtml}${suffix}`;
};

// Update overall work score display
window.updateWorkScoreDisplay = (paragraphEl, totalScore, reviewCount) => {
  const avg = reviewCount > 0 ? (totalScore / reviewCount).toFixed(1) : '0.0';
  const starsHtml = clientScoreToStars(avg);
  const scoreHtml = clientProcessScore(avg);
  const reviewText = reviewCount === 1 ? 'review' : 'reviews';
  const countText = reviewCount != null ? `(${reviewCount} ${reviewText})` : '';
  paragraphEl.innerHTML = `Overall: &nbsp; ${starsHtml} ${scoreHtml}<span class="star-suffix"><i>${countText}</i></span>`;
};

// Initialize user editable stars UI
window.initializeUserStars = (container) => {
  const originalScore = parseFloat(container.dataset.originalScore) || 0;

  const updatePreview = (score) => {
    container.innerHTML = renderCompleteUserStarsHtml(score);
  };

  updatePreview(originalScore);

  // Remove old handlers if re-initializing
  ['mouseover', 'mouseout', 'click'].forEach(evt => {
    container.removeEventListener(evt, container[`__${evt}Handler__`]);
  });

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

  const handleMouseOut = (e) => {
    const updatedScore = parseFloat(container.dataset.originalScore) || 0;
    Array.from(container.querySelectorAll('.user-star')).forEach(el => {
      const v = parseInt(el.dataset.value, 10);
      el.classList.remove('bi-star-fill', 'bi-star');
      el.classList.add(v <= updatedScore ? 'bi-star-fill' : 'bi-star');
      el.style.border = 'none';
    });
  };

  const handleClick = async (e) => {
    const clickedStar = e.target.closest('.user-star');
    if (!clickedStar) return;

    e.stopPropagation();
    e.preventDefault();

    const newScore = parseInt(clickedStar.dataset.value, 10);
    const wrapper = clickedStar.closest('.user-rating-wrapper');
    if (!wrapper) return alert('Could not find context.');

    const {
      editionOlid,
      workOlid
    } = wrapper.dataset;
    console.log('Clicked star for user score update', {
      editionOlid,
      workOlid,
      newScore
    });

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

      if (!resp.ok || !body.success) {
        if (resp.status === 401) {
          alert('Please log in to rate.');
          window.location = '/login';
        } else {
          throw new Error(body.message || 'Failed to update rating');
        }
        return;
      }

      // 1. Update main work score on edition.ejs
      const fullEditionSection = document.getElementById('edition-work-score');
      if (fullEditionSection) {
        const p = fullEditionSection.querySelector('p');
        if (p) window.updateWorkScoreDisplay(p, body.newWorkScore, body.newWorkReviewCount);
      }

      // 2. Update user star blocks (all wrappers)
      document.querySelectorAll(`.user-rating-wrapper[data-edition-olid="${editionOlid}"]`).forEach(userWrapper => {
        const starsContainer = userWrapper.querySelector('.user-stars-container');
        if (starsContainer) {
          starsContainer.dataset.originalScore = body.newUserScore;
          starsContainer.innerHTML = renderCompleteUserStarsHtml(body.newUserScore);
          window.initializeUserStars(starsContainer); // reattach listeners
        }

        const cardContainer = userWrapper.closest('.card-container');
        if (cardContainer) {
          const workScoreP = cardContainer.querySelector('.work-score-section p');
          if (workScoreP) {
            window.updateWorkScoreDisplay(workScoreP, body.newWorkScore, body.newWorkReviewCount);
          }
        }
      });

      // 3. Refresh user review section (if on edition.ejs)
      window.refreshUserReviewSection?.();

    } catch (err) {
      console.error(err);
      alert('Error submitting rating. Refresh and try again.');
    }
  };

  container.addEventListener('mouseover', handleMouseOver);
  container.addEventListener('mouseout', handleMouseOut);
  container.addEventListener('click', handleClick);

  container.__mouseoverHandler__ = handleMouseOver;
  container.__mouseoutHandler__ = handleMouseOut;
  container.__clickHandler__ = handleClick;
};

// Initialize all on DOM load
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.user-stars-container').forEach(el => {
    window.initializeUserStars(el);
  });
});