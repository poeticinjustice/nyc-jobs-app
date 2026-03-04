// Strip HTML tags and collapse whitespace into a plain-text preview
export const stripHtml = (html) => {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
