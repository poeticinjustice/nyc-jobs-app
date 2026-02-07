// Text cleaning utilities - lightweight client-side fallback
// Server now handles primary text cleaning via jobHelpers.js

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
    '&mdash;': '\u2014',
    '&ndash;': '\u2013',
    '&hellip;': '\u2026',
    '&ldquo;': '\u201c',
    '&rdquo;': '\u201d',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&bull;': '\u2022',
  };

  return text.replace(/&[a-zA-Z0-9#]+;/g, (match) => {
    return entities[match] || match;
  });
};

// Clean text - decode HTML entities (server handles the heavy lifting)
export const cleanText = (text) => {
  if (!text) return text;
  return decodeHtmlEntities(text);
};

// Alias for backwards compatibility with search results display
export const cleanTextForDisplay = cleanText;

// Safely render HTML content by converting <br><br> to paragraphs
export const renderHtmlContent = (htmlString) => {
  if (!htmlString) return null;

  const paragraphs = htmlString.split(/<br\s*\/?><br\s*\/?>/);

  return paragraphs
    .map((paragraph, index) => {
      if (!paragraph.trim()) return null;

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
    .filter(Boolean);
};
