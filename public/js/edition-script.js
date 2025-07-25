// public/js/edition-script.js

document.addEventListener('DOMContentLoaded', () => {
    // === GLOBAL STATE & CONSTANTS ===
    const body = document.body;
    const editionOlid = body.dataset.editionOlid;
    const workOlid = body.dataset.workOlid;
    window.userReviewId = body.dataset.userReviewID || '';
    let hasUserReview = Boolean(window.userReviewId);
    const isUserLoggedIn = Boolean(body.dataset.username);
    let isInCollection = (body.dataset.isInCollection === 'true');

    // === DOM REFERENCES ===
    const reviewActionContainer = document.getElementById('review-action-container');
    const collectionStatusContainer = document.querySelector('.edition-collection-status-container');
    const userReviewFormWrapper = document.getElementById('user-review-form');
    const section = document.getElementById('user-review-section');
    const statusDropdown = document.querySelector('.status-select');
    const removeBtn = document.getElementById('remove-book-button');
    const noReviewPlaceholder = document.getElementById('no-reviews-placeholder');

    // === HELPER: DOM Elements by Role ===
    function getElements() {
        return {
            addBtn: reviewActionContainer.querySelector('.add-review-button'),
            infoSpan: document.getElementById('add-book-span'),
            userCard: document.querySelector(`#review-container-${window.userReviewId} .review-card`)
        };
    }

    // === INITIALIZE STAR PICKER IN FORM ===
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

        const updateStars = score => {
            [...starIcons.children].forEach((starEl, idx) => {
                const value = idx + 1;
                starEl.classList.toggle('bi-star-fill', value <= score);
                starEl.classList.toggle('bi-star', value > score);
            });
        };

        const updateLabel = score => scoreLabel.textContent = score;
        const updateHiddenInput = score => hiddenInput.value = score;
        const updateButtonState = () => {
            const submitBtn = document.getElementById('submitReviewButton');
            if (submitBtn) submitBtn.disabled = selectedScore === 0;
        };

        updateLabel(currentScore);
        updateHiddenInput(currentScore);
        updateButtonState();

        starIcons.addEventListener('mouseover', e => {
            const star = e.target.closest('.user-star');
            if (star) {
                const val = parseInt(star.dataset.value, 10);
                updateStars(val);
                updateLabel(val);
            }
        });

        starIcons.addEventListener('mouseout', () => {
            updateStars(selectedScore);
            updateLabel(selectedScore);
        });

        starIcons.addEventListener('click', e => {
            const star = e.target.closest('.user-star');
            if (star) {
                const val = parseInt(star.dataset.value, 10);
                selectedScore = currentScore = val;
                updateStars(val);
                updateLabel(val);
                updateHiddenInput(val);
                updateButtonState();
            }
        });
    }

    // === RENDER COLLECTION BADGE OR BUTTON ===
    function renderCollectionStatus() {
        if (!collectionStatusContainer || !isUserLoggedIn) return;
        collectionStatusContainer.innerHTML = '';

        const removeContainer = document.querySelector('.remove-book-button-container');
        if (removeContainer) removeContainer.classList.toggle('invisible', !isInCollection);

        const statusWrapper = document.querySelector('.book-status');
        if (statusWrapper) statusWrapper.classList.toggle('invisible', !isInCollection);

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
            document.getElementById('edition-add-books-button')?.addEventListener('click', handleAddButtonClick);
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

            document.getElementById('edition-user-score-section')?.classList.remove('invisible');
            document.querySelector('.book-status')?.classList.remove('invisible');
            renderCollectionStatus();
            renderReviewActionStatus();
        } catch (err) {
            alert('Error adding to collection: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Add to My Collection';
        }
    }

    // === REVIEW LOGIC: ADD/EDIT FORM, DISPLAY, DELETE ===
    function renderReviewActionStatus() {
        const {
            addBtn,
            infoSpan
        } = getElements();
        addBtn?.classList.add('invisible');
        infoSpan?.classList.add('invisible');

        if (!isUserLoggedIn) return;
        if (!isInCollection) infoSpan?.classList.remove('invisible');
        else if (!hasUserReview) addBtn?.classList.remove('invisible');
    }

    function openReviewForm(initial = {}) {
        const {
            addBtn,
            userCard
        } = getElements();
        addBtn?.classList.add('invisible');
        userCard?.classList.add('invisible');
        showReviewForm(initial);
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
            reviewId: review_id || window.userReviewId || '',
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
            if (!resp.ok) throw new Error(`Status ${resp.status}`);

            userReviewFormWrapper.innerHTML = await resp.text();
            setTimeout(initializeFormStars, 0);
            document.getElementById('reviewForm')?.addEventListener('submit', handleReviewFormSubmission);
            document.getElementById('cancelReviewButton')?.addEventListener('click', hideReviewForm);
        } catch (err) {
            console.error('Review form error:', err);
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

    async function handleReviewFormSubmission(evt) {
        evt.preventDefault();
        const form = evt.target;
        const score = parseInt(form.querySelector('#reviewFormScoreInput')?.value, 10);
        if (!score) return alert('Select a rating');
        const btn = form.querySelector('#submitReviewButton');
        btn.disabled = true;
        btn.textContent = 'Submitting...';

        try {
            const resp = await fetch('/set-user-review', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    edition_olid: editionOlid,
                    review_title: form.reviewTitle.value,
                    review: form.review.value,
                    score
                })
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data?.message || 'Unexpected error.');

            window.userReviewId = data.userReviewID || window.userReviewId;
            hasUserReview = true;
            await refreshReviewSection();

            const topStars = document.querySelector('#edition-user-score-section .user-stars-container');
            if (topStars) {
                topStars.dataset.originalScore = score;
                window.initializeUserStars(topStars);
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
            if (!resp.ok) return;

            const html = await resp.text();
            let wrapper = document.getElementById(`review-container-${window.userReviewId}`);
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.id = `review-container-${window.userReviewId}`;
                section.insertBefore(wrapper, section.firstChild);
            }

            wrapper.innerHTML = html;
            noReviewPlaceholder?.classList.add('invisible');
            window.initializeUserStars(wrapper.querySelector('.user-stars-container'));
        } finally {
            renderReviewActionStatus();
        }
    }

    // === REVIEW BUTTON EVENTS ===
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
            openReviewForm();
        }
    });

    // === STATUS DROPDOWN LOGIC ===
    function applyStatusClass(select) {
        select.classList.remove('status-unread', 'status-reading', 'status-completed');
        const val = parseInt(select.value, 10);
        if ([1, 2, 3].includes(val)) select.classList.add('status-unread');
        else if (val === 4) select.classList.add('status-reading');
        else if (val === 5) select.classList.add('status-completed');
    }

    if (statusDropdown) {
        applyStatusClass(statusDropdown);
        statusDropdown.addEventListener('click', e => e.stopPropagation());
        statusDropdown.addEventListener('change', async e => {
            const select = e.target;
            const newStatusId = parseInt(select.value, 10);

            try {
                const resp = await fetch('/set-user-book-status', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        edition_olid: editionOlid,
                        status_id: newStatusId
                    })
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data?.message || 'Unexpected error.');
                applyStatusClass(select);
                select.blur();
            } catch (err) {
                console.error('Error updating status:', err);
                alert('Failed to update status.');
            }
        });
    }

    // === REMOVE FROM COLLECTION ===
    if (removeBtn) {
        removeBtn.addEventListener('click', async e => {
            e.preventDefault();
            if (!confirm('Are you sure you want to remove this book from your collection?')) return;

            try {
                const resp = await fetch('/delete-user-book', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        edition_olid: editionOlid
                    })
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data?.message || 'Unexpected error.');

                isInCollection = false;
                hasUserReview = false;

                const card = document.getElementById(`review-container-${window.userReviewId}`);
                if (card) card.remove();
                window.userReviewId = '';

                renderCollectionStatus();
                renderReviewActionStatus();

                const scoreWrapper = document.getElementById('edition-user-score-section');
                scoreWrapper?.classList.add('invisible');

                const stars = scoreWrapper?.querySelector('.user-stars-container');
                if (stars) {
                    stars.dataset.originalScore = '0';
                    window.initializeUserStars?.(stars);
                }

                document.querySelector('.book-status')?.classList.add('invisible');
                
                const workScoreP = document.querySelector('#edition-work-score p');
                if (workScoreP && data.workScore != null && data.reviewCount != null) {
                    window.updateWorkScoreDisplay(workScoreP, data.workScore, data.reviewCount);
                }

                userReviewFormWrapper.innerHTML = '';
                userReviewFormWrapper.classList.add('invisible');

                const remainingReviews = section.querySelectorAll('.review-card');
                if (remainingReviews.length === 0) {
                    noReviewPlaceholder?.classList.remove('invisible');
                }
            } catch (err) {
                alert('Failed to remove book: ' + err.message);
            }
        });
    }

    // === INITIALIZE ===
    renderCollectionStatus();
    renderReviewActionStatus();
    window.refreshUserReviewSection = refreshReviewSection;
});