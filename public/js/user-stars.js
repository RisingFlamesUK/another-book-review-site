// public/js/user-stars.js

document.addEventListener('DOMContentLoaded', () => {

    // --- Client-side helper functions (MUST be defined here or imported) ---
    const clientScoreToStars = (score) => {
        if (score === null) score = 0;
        const starScore = Math.round(score);
        let stars = '';
        for (let i = 1; i <= starScore; i++) {
            stars += '<i class="bi bi-star-fill"></i>';
        }
        for (let i = starScore + 1; i <= 5; i++) {
            stars += '<i class="bi bi-star"></i>';
        }
        return stars;
    };

    const clientProcessScore = (score) => {
        return score === null ? "" : '<span class="work-score">(' + score + ")</span>";
    };

    const renderUserStarsHtml = (scoreToDisplay) => {
        const roundedScore = scoreToDisplay !== null ? Math.round(scoreToDisplay) : 0;
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            const starClass = (i <= roundedScore) ? 'bi bi-star-fill' : 'bi bi-star';
            starsHtml += `<i class="user-star ${starClass}" data-value="${i}"></i>`;
        }
        return starsHtml;
    };


    // --- User Rating Interactivity ---
    // Select all userStarsContainers. This will work for both my-books and edition pages.
    // On my-books, it will find multiple. On edition, it will find one (if logged in).
    const userStarsContainers = document.querySelectorAll('.user-stars-container');

    userStarsContainers.forEach(container => {
        // originalScore is for the specific container being iterated
        let originalScore = parseFloat(container.dataset.originalScore);

        const updateUserStarsAppearance = (scoreToDisplay) => {
            const userScoreParagraph = container.querySelector('p');
            if (userScoreParagraph) {
                const starsHtml = renderUserStarsHtml(scoreToDisplay);
                let prefixText;
                let suffixHtml = '';

                if (scoreToDisplay === 0) {
                    prefixText = 'Review Now: &nbsp;&nbsp;&nbsp;';
                    suffixHtml = '<span class="star-suffix">&nbsp;(Not reviewed)</span>';
                } else {
                    prefixText = 'My Score: &nbsp;&nbsp;&nbsp;';
                    suffixHtml = '';
                }
                userScoreParagraph.innerHTML = `${prefixText}${starsHtml}${suffixHtml}`;
            }
        };

        // Initial render for the user stars
        updateUserStarsAppearance(originalScore);

        // --- Event Delegation for Hover Effects ---
        container.addEventListener('mouseover', function(event) {
            const hoveredStar = event.target.closest('.user-star');
            if (hoveredStar) {
                const hoverValue = parseInt(hoveredStar.dataset.value);
                const currentStars = Array.from(container.querySelectorAll('.user-star'));

                currentStars.forEach(star => {
                    const starValue = parseInt(star.dataset.value);
                    star.classList.remove('bi-star-fill', 'bi-star', 'hover-fill');
                    star.classList.add('bi');
                    if (starValue <= hoverValue) {
                        star.classList.add('bi-star-fill', 'hover-fill');
                    } else {
                        star.classList.add('bi-star');
                    }
                    star.style.border = '1px dashed rgba(255, 231, 12, 0.5)';
                    star.style.boxSizing = 'border-box';
                });
            }
        });

        container.addEventListener('mouseout', function(event) {
            const currentStars = Array.from(container.querySelectorAll('.user-star'));
            currentStars.forEach(star => {
                const starValue = parseInt(star.dataset.value);
                star.classList.remove('bi-star-fill', 'bi-star', 'hover-fill');
                star.classList.add('bi');
                if (starValue <= Math.round(originalScore)) {
                    star.classList.add('bi-star-fill');
                } else {
                    star.classList.add('bi-star');
                }
                star.style.border = 'none';
            });
        });

        // --- Click to set score (uses event delegation) ---
        container.addEventListener('click', async function(event) {
            const clickedStar = event.target.closest('.user-star');
            if (clickedStar) {
                event.preventDefault();
                event.stopPropagation();

                const newScore = parseInt(clickedStar.dataset.value);
                // For a single edition page, the parent will be the .user-rating-wrapper
                // For a book_card, it's the .card-container
                const parentContext = this.closest('.card-container') || this.closest('.user-rating-wrapper');

                if (!parentContext) {
                    console.error('Could not find parent context for edition/work OLIDs.');
                    alert('An error occurred. Please refresh the page and try again.');
                    return;
                }

                const editionOlid = parentContext.dataset.editionOlid;
                const workOlid = parentContext.dataset.workOlid;

                try {
                    const response = await fetch('/set-user-score', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            edition_olid: editionOlid,
                            work_olid: workOlid,
                            score: newScore
                        }),
                    });

                    if (response.ok) {
                        const result = await response.json();
                        if (result.success) {
                            // Update user's score on the card
                            originalScore = result.newUserScore;
                            container.dataset.originalScore = result.newUserScore;
                            updateUserStarsAppearance(originalScore);

                            // Find the correct work score section based on context
                            let workScoreSection;
                            if (parentContext.classList.contains('card-container')) {
                                // For my-books page
                                workScoreSection = parentContext.querySelector('.work-score-section');
                            } else if (parentContext.classList.contains('user-rating-wrapper')) {
                                // For edition page
                                workScoreSection = document.getElementById('edition-work-score');
                            }

                            if (workScoreSection) {
                                const workScoreParagraph = workScoreSection.querySelector('p');
                                if (workScoreParagraph) {
                                    let newWorkStarsHtml = clientScoreToStars(result.newWorkScore);
                                    let newWorkScoreNumberHtml = clientProcessScore(result.newWorkScore);
                                     let reviewText = 'review';
                                    if (result.newWorkReviewCount !== 1) {
                                        reviewText += 's';
                                    }
                                    let newWorkReviewCountText = result.newWorkReviewCount !== null ? `(${result.newWorkReviewCount} ${reviewText})` : '';

                                    // Check if it's a card container (my-books) or the main edition page
                                    if (parentContext.classList.contains('card-container')) {
                                        workScoreParagraph.innerHTML = `Average Rating: ${newWorkStarsHtml} ${newWorkScoreNumberHtml}<span class="star-suffix"><i> ${newWorkReviewCountText}</i></span>`;
                                    } else { // Assuming it's the edition page
                                        workScoreParagraph.innerHTML = `Overall: &nbsp; ${newWorkStarsHtml} ${newWorkScoreNumberHtml}<span class="star-suffix"><i>${newWorkReviewCountText}</i></span>`;
                                    }
                                }
                            }
                        } else {
                            alert('Failed to update your rating: ' + (result.message || 'Unknown error'));
                        }
                    } else {
                        // --- IMPORTANT CHANGE HERE ---
                        if (response.status === 401) {
                            alert('You are not logged in. Please log in to update your rating.');
                            window.location.href = '/login'; // Redirect to your login page
                        } else {
                            const errorText = await response.text();
                            console.error('Server response:', response.status, errorText);
                            alert('Server error while updating rating. Please try again. Status: ' + response.status);
                        }
                    }
                } catch (error) {
                    console.error('Error setting user score:', error);
                    alert('An error occurred while submitting your rating. Please try again.');
                }
            }
        });
    });
});