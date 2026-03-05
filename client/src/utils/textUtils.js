// JSX-based function stays client-side (requires React)
import { decodeEntities as decode } from 'nyc-jobs-shared/utils/textUtils';

// Re-export platform-agnostic text utilities from shared
export { decodeEntities, stripHtml, truncateText } from 'nyc-jobs-shared/utils/textUtils';

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
