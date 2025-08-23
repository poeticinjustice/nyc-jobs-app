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
    .replace(/â¢|â€¢|â€¢/g, '•')

    // Fix smart quotes and apostrophes
    .replace(/â€™|â€™|â€™/g, "'")
    .replace(/â€œ|â€œ|â€œ/g, '"')
    .replace(/â€|â€|â€/g, '"')
    .replace(/â€˜|â€˜|â€˜/g, "'")

    // Fix dashes
    .replace(/â€"|â€"/g, '–')
    .replace(/â€"|â€"/g, '—')

    // Fix ellipsis
    .replace(/â€¦/g, '…')

    // Convert 2+ consecutive spaces to paragraph breaks, but preserve list formatting
    .replace(/(?<!^|\n|\r|\t|\s*[•\-\*\+]\s*|\s*\d+\.\s*)\s{2,}/g, '<br><br>');

  return cleaned;
};

// Clean text and convert 2+ spaces to line breaks for display
export const cleanTextForDisplay = (text) => {
  if (!text) return text;

  // First decode HTML entities
  let cleaned = decodeHtmlEntities(text);

  // Apply targeted fixes for common patterns
  cleaned = cleaned
    // Fix bullet points (most common issue)
    .replace(/â¢|â€¢|â€¢/g, '•')

    // Fix smart quotes and apostrophes
    .replace(/â€™|â€™|â€™/g, "'")
    .replace(/â€œ|â€œ|â€œ/g, '"')
    .replace(/â€|â€|â€/g, '"')
    .replace(/â€˜|â€˜|â€˜/g, "'")

    // Fix dashes
    .replace(/â€"|â€"/g, '–')
    .replace(/â€"|â€"/g, '—')

    // Fix ellipsis
    .replace(/â€¦/g, '…')

    // Convert 2+ consecutive spaces to line breaks for display, but preserve list formatting
    .replace(/(?<!^|\n|\r|\t|\s*[•\-\*\+]\s*|\s*\d+\.\s*)\s{2,}/g, '\n\n');

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

// Safely render HTML content by converting HTML tags to React elements
export const renderHtmlContent = (htmlString) => {
  if (!htmlString) return null;

  // Split by <br><br> to create paragraphs
  const paragraphs = htmlString.split(/<br\s*\/?><br\s*\/?>/);

  return paragraphs
    .map((paragraph, index) => {
      if (!paragraph.trim()) {
        return null; // Skip empty paragraphs
      }

      // Convert any remaining <br> tags to line breaks within paragraphs
      const parts = paragraph.split(/(<br\s*\/?>)/);
      const paragraphContent = parts.map((part, partIndex) => {
        if (part.match(/<br\s*\/?>/i)) {
          return <br key={`br-${index}-${partIndex}`} />;
        }
        return part;
      });

      return (
        <p key={index} className='mb-4 last:mb-0'>
          {paragraphContent}
        </p>
      );
    })
    .filter(Boolean); // Remove null entries
};
