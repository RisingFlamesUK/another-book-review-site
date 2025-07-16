// public/js/edition-script.js
document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const editionOlid = body.dataset.editionOlid;
    const workOlid = body.dataset.workOlid;
    let userReviewId = body.dataset.userReviewID || '';
    let hasUserReview = Boolean(userReviewId);
    const isUserLoggedIn = Boolean(body.dataset.username);
    let isInCollection = (body.dataset.isInCollection === 'true');

    // DOM references
    const reviewActionContainer = document.getElementById('review-action-container');
    const collectionStatusContainer = document.querySelector('.edition-collection-status-container');
    const userReviewFormWrapper = document.getElementById('user-review-form');
    const backButton = document.getElementById('backButton');
    const section = document.getElementById('user-review-section');

    function getElements() {
        return {
            addBtn: reviewActionContainer.querySelector('.add-review-button'),
            infoSpan: document.getElementById('add-book-span'),
            userCard: document.querySelector(`#review-container-${userReviewId} .review-card`)
        };
    }

    function initializeFormStars() {
        const starContainer = document.getElementById('reviewStarPicker');
        const hiddenInput = document.getElementById('reviewFormScoreInput');
        const scoreLabel = document.getElementById('selected-star-score');

        if (!starContainer || !hiddenInput || !scoreLabel) return;

        let currentScore = parseInt(starContainer.dataset.originalScore, 10) || 0;
        let selectedScore = currentScore;

        const starIcons = starContainer.querySelector('#reviewStarIcons');
        starIcons.innerHTML = '';
        for (let i = 1; i <= 5; i++) {
            const star = document.createElement('i');
            star.className = `user-star bi ${i <= currentScore ? 'bi-star-fill' : 'bi-star'}`;
            star.dataset.value = i;
            star.title = `${i} star${i > 1 ? 's' : ''}`;
            starIcons.appendChild(star);
        }

        const updateStars = (score) => {
            [...starIcons.children].forEach((starEl, idx) => {
                const value = idx + 1;
                starEl.classList.remove('bi-star-fill', 'bi-star');
                starEl.classList.add(value <= score ? 'bi-star-fill' : 'bi-star');
            });
        };

        const updateLabel = (score) => {
            scoreLabel.textContent = score;
        };

        const updateHiddenInput = (score) => {
            hiddenInput.value = score;
        };

        updateLabel(currentScore);
        updateHiddenInput(currentScore);

        starIcons.addEventListener('mouseover', (e) => {
            const star = e.target.closest('.user-star');
            if (!star) return;
            const val = parseInt(star.dataset.value, 10);
            updateStars(val);
            updateLabel(val);
        });

        starIcons.addEventListener('mouseout', () => {
            updateStars(selectedScore);
            updateLabel(selectedScore);
        });

        starIcons.addEventListener('click', (e) => {
            const star = e.target.closest('.user-star');
            if (!star) return;
            const val = parseInt(star.dataset.value, 10);
            selectedScore = val;
            currentScore = val;
            updateStars(val);
            updateLabel(val);
            updateHiddenInput(val);
        });
    }




    function renderCollectionStatus() {
        if (!collectionStatusContainer || !isUserLoggedIn) return;
        collectionStatusContainer.innerHTML = '';
        if (isInCollection) {
            collectionStatusContainer.innerHTML = `
        <div id="edition-in-collection-badge" class="in-collection-badge" data-edition-olid="${editionOlid}">
          In My Collection <i class="bi bi-bookmark-check-fill"></i>
        </div>`;
        } else {
            collectionStatusContainer.innerHTML = `
        <div id="edition-add-books-button" class="add-books-button button page-navigation-button add-to-collection-btn" data-edition-olid="${editionOlid}">
          Add to My Collection<i class="bi bi-bookmark-plus-fill add-books-icon"></i>
        </div>`;
            const btn = document.getElementById('edition-add-books-button');
            if (btn) btn.addEventListener('click', handleAddButtonClick);
        }
    }

    async function handleAddButtonClick(e) {
        e.preventDefault();
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Adding...';
        try {
            const resp = await fetch('/add-edition', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    edition_olid: editionOlid
                })
            });
            if (!resp.ok) throw new Error(await resp.text());
            isInCollection = true;
            renderCollectionStatus();
            renderReviewActionStatus();
        } catch (err) {
            alert('Error adding to collection: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Add to My Collection';
        }
    }

    function renderReviewActionStatus() {
        if (!reviewActionContainer) return;
        const {
            addBtn,
            infoSpan
        } = getElements();

        // Always reset both invisible if needed
        addBtn?.classList.add('invisible');
        infoSpan?.classList.add('invisible');

        if (!isUserLoggedIn) {
            // logged out: both hidden
        } else if (!isInCollection) {
            // logged in but NOT in collection: show info span
            infoSpan?.classList.remove('invisible');
        } else {
            // in collection
            if (!hasUserReview) addBtn?.classList.remove('invisible');
        }
    }

    function openReviewForm(initial = {}) {
        const {
            addBtn,
            userCard
        } = getElements();
        addBtn?.classList.add('invisible');
        userCard?.classList.add('invisible');
        showReviewForm({
            review_id: initial.review_id,
            review_title: initial.review_title,
            review: initial.review,
            score: initial.score
        });
    }

    async function showReviewForm({
        review_id,
        review_title,
        review,
        score
    }) {
        userReviewFormWrapper.innerHTML = '';
        userReviewFormWrapper.classList.remove('invisible');
        const payload = {
            reviewId: review_id || userReviewId || '',
            initialTitle: review_title || '',
            initialReview: review || '',
            initialScore: score || 0
        };

        try {
            const resp = await fetch('/render-partial/review-form', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const text = await resp.text();
            if (!resp.ok) throw new Error(`Status ${resp.status}`);
            userReviewFormWrapper.innerHTML = text;
            setTimeout(() => {
                try {
                    initializeFormStars();
                } catch (starsErr) {
                    console.error('Error during initializeFormStars:', starsErr);
                }
            }, 0);

            // Attach event listeners
            document.getElementById('reviewForm')?.addEventListener('submit', handleReviewFormSubmission);
            document.getElementById('cancelReviewButton')?.addEventListener('click', hideReviewForm);

        } catch (renderErr) {
            console.error('Error assembling form:', renderErr);
            alert('Could not load review form.');
            hideReviewForm();
        }
    }

    function hideReviewForm() {
        userReviewFormWrapper.innerHTML = '';
        userReviewFormWrapper.classList.add('invisible');
        const {
            addBtn,
            userCard
        } = getElements();
        userCard?.classList.remove('invisible');
        renderReviewActionStatus();
    }

    document.addEventListener('click', e => {
        const edit = e.target.closest('.edit-review-button');
        if (edit && isUserLoggedIn) {
            const container = edit.closest(`[id^="review-container-"]`);
            const card = container?.querySelector('.review-card');
            openReviewForm({
                review_id: card?.dataset.reviewId,
                review_title: card?.dataset.initialtitle,
                review: card?.dataset.initialreview,
                score: +card?.dataset.initialscore
            });
        }
        if (e.target.closest('.add-review-button')) {
            // in-case the original EJS button exists
            openReviewForm();
        }
    });

    async function handleReviewFormSubmission(evt) {
        evt.preventDefault();
        const form = evt.target;
        const scoreStr = form.querySelector('#reviewFormScoreInput')?.value;
        if (!scoreStr) return alert('Select a rating');
        console.log('[DEBUG] Hidden score input value:', form.querySelector('#reviewFormScoreInput')?.value);
        const score = parseInt(scoreStr, 10);
        const btn = form.querySelector('#submitReviewButton');
        btn.disabled = true;
        btn.textContent = 'Submitting...';

        try {
            console.log('Submitting review with score:', score, typeof score);
            const resp = await fetch('/set-user-review', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    edition_olid: editionOlid,
                    review_title: form.reviewTitle.value,
                    review: form.review.value,
                    score: +score
                })
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.message);
            userReviewId = data.userReviewID || userReviewId;
            hasUserReview = true;
            await refreshReviewSection();

            const topStarsContainer = document.querySelector('#edition-user-score-section .user-stars-container');
            if (topStarsContainer) {
                topStarsContainer.dataset.originalScore = score;
                window.initializeUserStars(topStarsContainer);
            }

            const workScoreP = document.querySelector('#edition-work-score p');
            if (workScoreP && data.workScore != null && data.reviewCount != null) {
                window.updateWorkScoreDisplay(workScoreP, data.workScore, data.reviewCount);
            }
            hideReviewForm();
        } catch (err) {
            alert('Error saving review: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Submit Review';
        }
    }

    async function refreshReviewSection() {
        try {
            const resp = await fetch(`/render-partial/user-review?edition_olid=${editionOlid}&work_olid=${workOlid}`);
            if (resp.ok) {
                const html = await resp.text();
                let wrapper = document.getElementById(`review-container-${userReviewId}`);
                if (!wrapper) {
                    wrapper = document.createElement('div');
                    wrapper.id = `review-container-${userReviewId}`;
                    section.insertBefore(wrapper, section.firstChild);
                }
                wrapper.innerHTML = html;

                const newStarsWrapper = wrapper.querySelector('.user-stars-container');
                if (newStarsWrapper) {
                    window.initializeUserStars(newStarsWrapper);
                }
            }
        } finally {
            renderReviewActionStatus();
        }
    }

    backButton?.addEventListener('click', e => {
        e.preventDefault();
        window.history.back();
    });

    renderCollectionStatus();
    renderReviewActionStatus();
    window.refreshUserReviewSection = refreshReviewSection;
});