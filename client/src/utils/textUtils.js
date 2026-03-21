// JSX-based function stays client-side (requires React)
import DOMPurify from 'dompurify';
import { decodeEntities as decode } from 'nyc-jobs-shared/utils/textUtils';

// Re-export platform-agnostic text utilities from shared
export { decodeEntities, stripHtml, truncateText } from 'nyc-jobs-shared/utils/textUtils';

// Check if content has real HTML structure (not just <br> tags)
const hasRichHtml = (str) => /<(?:p|ul|ol|li|h[1-6]|div|table|section|b|strong|em|i)\b/i.test(str);

// Render plain text / <br>-only content (NYC Open Data style)
const renderPlainText = (htmlString) => {
  const paragraphs = htmlString.split(/<br\s*\/?><br\s*\/?>/);

  return paragraphs
    .map((paragraph, index) => {
      if (!paragraph.trim()) return null;

      const parts = paragraph.split(/(<br\s*\/?>)/);
      const paragraphContent = parts.map((part, partIndex) => {
        if (part.match(/<br\s*\/?>/i)) {
          return <br key={`br-${index}-${partIndex}`} />;
        }
        return decode(part.replace(/<[^>]+>/g, ''));
      });

      return (
        <p key={index} className='mb-4 last:mb-0'>
          {paragraphContent}
        </p>
      );
    })
    .filter(Boolean);
};

// Sanitize and render rich HTML content (Mount Sinai, Northwell, etc.)
const renderRichHtml = (htmlString) => {
  const clean = DOMPurify.sanitize(htmlString, {
    ALLOWED_TAGS: [
      'p', 'br', 'b', 'strong', 'i', 'em', 'u',
      'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'div', 'span', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'blockquote', 'pre', 'code', 'hr', 'sub', 'sup',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  });

  return (
    <div
      className='prose prose-gray max-w-none prose-headings:text-lg prose-headings:font-semibold prose-headings:mt-6 prose-headings:mb-2 prose-p:mb-3 prose-li:mb-1 prose-ul:mb-3 prose-ol:mb-3'
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
};

export const renderHtmlContent = (htmlString) => {
  if (!htmlString) return null;
  return hasRichHtml(htmlString) ? renderRichHtml(htmlString) : renderPlainText(htmlString);
};
