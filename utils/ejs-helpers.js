export function processScore(score = null) {
    let displayScore = "";
    if (score === null) {
        displayScore = "<span><i>&nbsp;(Not reviewed)</i></span>";
    } else {
        displayScore = "<span>" + score + "</span>";
    }

    return displayScore
}

export function scoreToStars(score = null) {
    if (score === null) {
        score = 0;
    }
    const starScore = Math.round(score);
    let stars = '';
    for (let i = 1; i <= starScore; i++) {
        stars += '<i class="bi bi-star-fill"></i>';
    }

    for (let i = starScore + 1; i <= 5; i++) {
        stars += '<i class="bi bi-star"></i>';
    }

    return stars
}

export function processAuthors(authors) {
    let displayAuthors = "";
    if (authors && Array.isArray(authors)) {
        authors.forEach(author => {
            displayAuthors = displayAuthors + author.name + ", ";
        });
        displayAuthors = displayAuthors.slice(0, displayAuthors.length - 2);
    } else if (authors.length > 0) {
        displayAuthors = authors;
    } else {
        displayAuthors = "Unknown Author";
    }
    return displayAuthors
}

export function processDescription(description, length) {
    let displayDescription = description || '';
    displayDescription = displayDescription.replace(/\r\n/g, '<br>');
    if (displayDescription.length > length) {
        displayDescription = displayDescription.slice(0, length) + ' <span class="more">...more</span>';
    }
    return displayDescription;
}