// Text cleaning utilities for handling UTF-8 encoding issues

// HTML entity decoder
const decodeHtmlEntities = (text) => {
  if (!text) return text;

  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&lsquo;': "'",
    '&rsquo;': "'",
    '&bull;': '•',
    '&bullet;': '•',
  };

  return text.replace(/&[a-zA-Z0-9#]+;/g, (match) => {
    return entities[match] || match;
  });
};

// Clean text by fixing common UTF-8 encoding issues
export const cleanText = (text) => {
  if (!text) return text;

  // First decode HTML entities
  let cleaned = decodeHtmlEntities(text);

  // Apply targeted fixes for common patterns
  cleaned = cleaned
    // Fix bullet points (most common issue)
    .replace(/â¢|â€¢|â¢/g, '•')

    // Fix smart quotes and apostrophes
    .replace(/â€™|â€™|â€™/g, "'")
    .replace(/â€œ|â€œ|â€œ/g, '"')
    .replace(/â€|â€|â€/g, '"')
    .replace(/â€˜|â€˜|â€˜/g, "'")

    // Fix dashes
    .replace(/â€"|â€"/g, '–')
    .replace(/â€"|â€"/g, '—')

    // Fix ellipsis
    .replace(/â€¦/g, '…');

  return cleaned;
};

// Format job description with proper line breaks and bullet points
export const formatJobDescription = (text) => {
  if (!text) return text;

  // First clean the text
  let formatted = cleanText(text);

  // Replace bullet points with proper formatting
  formatted = formatted
    .replace(/[â¢•â€¢â€¢â¢â€¢â€¢â€¢]/g, '\n- ')

    // Add line breaks for common patterns
    .replace(/(\d+ Hours\/)/g, '\n$1')
    .replace(/(Work Location:)/g, '\n\n$1')
    .replace(/(Additional Information:)/g, '\n\n$1')
    .replace(/(To Apply:)/g, '\n\n$1')
    .replace(/(Hours\/Shift:)/g, '\n\n$1')

    // Clean up multiple line breaks
    .replace(/\n\n\n+/g, '\n\n')
    .replace(/\n\s*\n\s*\n/g, '\n\n')

    // Trim whitespace
    .trim();

  return formatted;
};
