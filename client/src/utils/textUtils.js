// Decode common HTML entities
const decodeEntities = (text) =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&hellip;/g, '\u2026');

// Strip HTML tags, decode entities, and collapse whitespace into a plain-text preview
export const stripHtml = (html) => {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
};

// Truncate text to maxLen characters with ellipsis
export const truncateText = (text, maxLen = 200) => {
  if (!text) return '';
  const stripped = stripHtml(text);
  return stripped.length > maxLen ? stripped.substring(0, maxLen) + '...' : stripped;
};

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
        return decodeEntities(part.replace(/<[^>]+>/g, ''));
      });

      return (
        <p key={index} className='mb-4 last:mb-0'>
          {paragraphContent}
        </p>
      );
    })
    .filter(Boolean);
};
