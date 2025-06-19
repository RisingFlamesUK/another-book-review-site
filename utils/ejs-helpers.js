// utils/ejs-helper.js

export function processScore(score = null, mode) {
    let displayScore = "";
    if (score === null) {
        displayScore = '<span class="star-suffix"><i>&nbsp;(Not reviewed)</i></span>';
    } else if (mode === 'all') {
        displayScore = '<span class="work-score">(' + score + ")</span>";
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

export function processUserScore(userScore = null, maxStars = 5) {
    let starsHtml = '';
    let scorePrefix = '';
    let scoreSuffix = '';
    const roundedScore = userScore !== null ? Math.round(userScore) : 0; 

    if (userScore === null) {
        scorePrefix = '<p>Review Now: &nbsp;&nbsp;&nbsp;';
        scoreSuffix = '<span class="user-score-suffix not-reviewed"><i>&nbsp;(Not reviewed)</i></span><p>';
    } else {
        scorePrefix = '<p>My Score: &nbsp;&nbsp;&nbsp;';
        scoreSuffix = '</p>';
    }

    for (let i = 1; i <= maxStars; i++) {
        // Add data-value to each star to easily identify its rating value
        // Add classes for styling and JS targeting
        const starClass = (i <= roundedScore) ? 'bi bi-star-fill' : 'bi bi-star';
        starsHtml += `<i class="user-star ${starClass}" data-value="${i}" data-current-score="${userScore || 0}"></i>`;
    }

    return `<div class="user-stars-container" data-original-score="${userScore || 0}">${scorePrefix}${starsHtml}${scoreSuffix}</p></div>`;
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
    let originalDescription = description || '';

    // 0. Ensure description is a string
    if (typeof originalDescription !== 'string') {
        originalDescription = String(originalDescription);
    }

    let mainDescription = originalDescription;
    let containsSection = '';

    // Define an array of regex patterns to detect various "Contains" or similar sections.
    // The order matters: the first match found will be used.
    // Each regex should capture the 'contains' content in its last capturing group.
    const containsSectionRegexes = [
        // 1. Original "Contains" section (with optional bolding)
        // Matches: --- (2+ newlines) --- (1+ newline) **Contains** (2+ newlines) content
        /(\r?\n){2,}-{5,}(\r?\n){1,}\*\*?Contains\*\*?(\r?\n){2,}([\s\S]*)/,

        // 2. "Also contained in:" section
        // Matches: --- (2+ newlines) --- (1+ newline) Also contained in: (2+ newlines) content
        /(\r?\n){2,}-{5,}(\r?\n){1,}Also contained in:(\r?\n){2,}([\s\S]*)/,


        // Add more regex patterns here as needed.
        // Example: If you find "See also:" followed by similar formatting:
        // /(\r?\n){2,}-{5,}(\r?\n){3,}See also:(\r?\n){2,}([\s\S]*)/,
    ];

    let matchedRegex = null; // To store the regex that actually matched
    let match = null;         // To store the match result

    // Cycle through the regex patterns until a match is found
    for (const regex of containsSectionRegexes) {
        match = originalDescription.match(regex);
        if (match) {
            matchedRegex = regex; // Store the successful regex
            break; // Stop at the first successful match
        }
    }

    if (match) {
        // If any "Contains" section is found:
        // Everything before the match is the main description.
        mainDescription = originalDescription.substring(0, match.index);
        // The last captured group is the content of the "Contains" section.
        // This assumes all regexes in the array consistently use the last group for content.
        containsSection = match[4];
    }

    // --- Process mainDescription ---
    // At this point, the mainDescription string no longer contains the "Contains" section or the horizontal line.

    // Process remaining newlines to <br> tags, limiting consecutive <br> to two in mainDescription
    mainDescription = mainDescription.replace(/\r\n/g, '<br>');
    mainDescription = mainDescription.replace(/(<br>){3,}/g, '<br><br>');
    mainDescription = mainDescription.replace(/\n{3,}/g, '<br><br>');

    // Handle Markdown bold text: **text** to <strong>text</strong> in mainDescription
    mainDescription = mainDescription.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Remove any trailing <br> tags from the main description before truncation
    mainDescription = mainDescription.replace(/(<br>\s*)+$/, '');

    // Truncation for mainDescription (always apply this last for the description part)
    if (mainDescription.length > length) {
        let safeTruncationPoint = mainDescription.slice(0, length).lastIndexOf(' ');
        if (safeTruncationPoint === -1 || safeTruncationPoint < length * 0.8) {
            safeTruncationPoint = length;
        }
        mainDescription = mainDescription.slice(0, safeTruncationPoint) + ' <span class="more">...more</span>';
    }

    // --- Process containsSection ---
    // We'll apply formatting to the extracted 'contains' section as well

    // 1. Process reference link definitions first (these are likely in 'containsSection')
    const referenceLinks = {};
    const referenceLinkRegex = /^\s*\[(\d+)\]:\s*(.+)$/gm;
    let containsMatch;
    // Use a temporary copy of containsSection for initial regex exec to avoid issues with global flag
    let tempContainsSection = containsSection;
    while ((containsMatch = referenceLinkRegex.exec(tempContainsSection)) !== null) {
        const label = containsMatch[1];
        const url = containsMatch[2].trim();
        referenceLinks[label] = url;
    }
    // Remove the reference link definitions from the containsSection
    containsSection = containsSection.replace(referenceLinkRegex, '');

    // 2. Handle Markdown inline links: [text](url)
    containsSection = containsSection.replace(/\[(.*?)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 3. Handle Markdown reference link usages: [text][label]
    containsSection = containsSection.replace(/\[(.*?)\]\[(\d+)\]/g, (match, text, label) => {
        const url = referenceLinks[label];
        if (url) {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
        }
        return match;
    });

    // 4. Handle Markdown bold text: **text** to <strong>text</strong>
    containsSection = containsSection.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 5. Superscript for standalone numeric references like [1], [2], [3]
    containsSection = containsSection.replace(/\[(\d+)\](?![ (\[])/g, '<sup>[$1]</sup>');

    // 6. Process remaining newlines to <br> tags, limiting consecutive <br> to two in containsSection
    containsSection = containsSection.replace(/\r\n/g, '<br>');
    containsSection = containsSection.replace(/(<br>){3,}/g, '<br><br>');
    containsSection = containsSection.replace(/\n{3,}/g, '<br><br>');

    // Remove any leading/trailing whitespace or <br> from the contains section
    containsSection = containsSection.trim().replace(/^(<br>\s*)+/g, '').replace(/(<br>\s*)+$/g, '');

    return {
        description: mainDescription,
        contains: containsSection
    };
}

export function toTitleCase(str) {
    return str.replace(
        /\w\S*/g,
        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
}