/* eslint-disable testing-library/no-container, testing-library/no-node-access */
// These rules push you toward accessible queries, which is right for UI tests.
// This file tests HTML *sanitization*, where the assertion is "no <script>
// element or on* attribute survived" — that is only expressible by inspecting
// the rendered DOM directly, so the rules are disabled for this file only.

import { render } from '@testing-library/react';
import {
  renderHtmlContent,
  decodeEntities,
  stripHtml,
  truncateText,
} from './textUtils';

// renderHtmlContent returns either a single element (rich HTML) or an array of
// <p> elements (plain-text path), so always wrap before rendering.
const renderContent = (html) => render(<div>{renderHtmlContent(html)}</div>);

describe('renderHtmlContent — rich HTML (DOMPurify path)', () => {
  it('strips <script> tags while keeping safe formatting tags', () => {
    const { container } = renderContent(
      '<p>Hello <strong>world</strong> and <em>friends</em></p><script>window.pwned = true;</script>'
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toMatch(/pwned/);
    expect(container.querySelector('strong')).toHaveTextContent('world');
    expect(container.querySelector('em')).toHaveTextContent('friends');
    expect(container.textContent).toContain('Hello world and friends');
  });

  it('strips inline event handlers such as onerror/onclick', () => {
    const { container } = renderContent(
      '<p onerror="window.pwned = true" onclick="window.pwned = true">danger</p>' +
        '<img src="x" onerror="window.pwned = true">'
    );

    const p = container.querySelector('p');
    expect(p).not.toBeNull();
    expect(p.hasAttribute('onerror')).toBe(false);
    expect(p.hasAttribute('onclick')).toBe(false);
    // <img> is not in ALLOWED_TAGS
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toMatch(/onerror/i);
  });

  it('keeps list and heading structure', () => {
    const { container } = renderContent(
      '<h2>Responsibilities</h2><ul><li>One</li><li>Two</li></ul>'
    );

    expect(container.querySelector('h2')).toHaveTextContent('Responsibilities');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('forces rel="noopener noreferrer" on links that open a new tab', () => {
    const { container } = renderContent(
      '<p><a href="https://example.com" target="_blank">Apply</a></p>'
    );

    const link = container.querySelector('a');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('overwrites an unsafe rel on a target="_blank" link', () => {
    const { container } = renderContent(
      '<p><a href="https://example.com" target="_blank" rel="opener">Apply</a></p>'
    );

    expect(container.querySelector('a')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('leaves same-tab links without a forced rel', () => {
    const { container } = renderContent('<p><a href="https://example.com">Apply</a></p>');

    const link = container.querySelector('a');
    expect(link.hasAttribute('target')).toBe(false);
    expect(link.hasAttribute('rel')).toBe(false);
  });

  it('removes javascript: hrefs', () => {
    /* eslint-disable-next-line no-script-url */
    const { container } = renderContent('<p><a href="javascript:window.pwned=1">x</a></p>');

    const link = container.querySelector('a');
    expect(link.getAttribute('href')).toBeNull();
  });
});

describe('renderHtmlContent — plain-text path', () => {
  it('returns null for empty content', () => {
    expect(renderHtmlContent('')).toBeNull();
    expect(renderHtmlContent(null)).toBeNull();
    expect(renderHtmlContent(undefined)).toBeNull();
  });

  it('splits double <br> into separate paragraphs and decodes entities', () => {
    const { container } = renderContent(
      'Research &amp; Analysis<br><br>Salary is &gt; $50,000'
    );

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveTextContent('Research & Analysis');
    expect(paragraphs[1]).toHaveTextContent('Salary is > $50,000');
  });

  it('renders single <br> as a line break inside one paragraph', () => {
    const { container } = renderContent('Line one<br>Line two');

    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('renders text with no structure as a single paragraph', () => {
    const { container } = renderContent('Just a sentence with no markup at all');

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toHaveTextContent('Just a sentence with no markup at all');
  });

  it('splits on known section headings when there are no <br> tags', () => {
    const { container } = renderContent(
      'About Us We hire people. Responsibilities Do the work. Qualifications A degree.'
    );

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBeGreaterThan(1);
    expect(container.textContent).toContain('About Us');
    expect(container.textContent).toContain('Qualifications');
  });

  it('does not emit raw HTML from the plain-text path', () => {
    const { container } = renderContent('Hello<br><br>there <script>window.pwned=1</script>');

    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toMatch(/<script/i);
  });
});

describe('shared text utility re-exports', () => {
  it('re-exports decodeEntities', () => {
    expect(decodeEntities('A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39;&nbsp;f')).toBe(
      'A & B <c> "d" \'e\' f'
    );
    expect(decodeEntities('&mdash;&ndash;&hellip;')).toBe('—–…');
  });

  it('re-exports stripHtml', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
    expect(stripHtml('a<br>b')).toBe('a b');
    expect(stripHtml('')).toBe('');
  });

  it('re-exports truncateText', () => {
    expect(truncateText('<p>abcdefghij</p>', 5)).toBe('abcde...');
    expect(truncateText('abc', 5)).toBe('abc');
    expect(truncateText('')).toBe('');
    expect(truncateText(null)).toBe('');
  });
});
