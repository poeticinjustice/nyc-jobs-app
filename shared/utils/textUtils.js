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
const stripHtml = (html) => {
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
const truncateText = (text, maxLen = 200) => {
  if (!text) return '';
  const stripped = stripHtml(text);
  return stripped.length > maxLen ? stripped.substring(0, maxLen) + '...' : stripped;
};

module.exports = { decodeEntities, stripHtml, truncateText };
