import { render, screen } from '@testing-library/react';
import { JOB_SOURCES, SOURCE_OPTIONS } from 'nyc-jobs-shared/constants';
import Sources, { SOURCE_GROUPS, sourceLabel } from './Sources';

const groupedKeys = SOURCE_GROUPS.flatMap((group) => group.sources.map((s) => s.key));

describe('Sources page groups', () => {
  it('lists every shared job source exactly once', () => {
    // If this fails, a source was added to shared JOB_SOURCES without being
    // given a group, URL, and description on the Sources page.
    JOB_SOURCES.forEach((source) => {
      expect(groupedKeys.filter((key) => key === source)).toEqual([source]);
    });
  });

  it('contains no keys that are not real job sources', () => {
    groupedKeys.forEach((key) => {
      expect(JOB_SOURCES).toContain(key);
    });
    expect(groupedKeys).toHaveLength(JOB_SOURCES.length);
  });

  it('gives every entry a URL and a description', () => {
    SOURCE_GROUPS.forEach((group) => {
      group.sources.forEach((source) => {
        expect(source.url).toMatch(/^https?:\/\//);
        expect(source.description).toBeTruthy();
      });
    });
  });
});

describe('Sources page rendering', () => {
  it('labels each source with its full name, falling back to the shared label', () => {
    render(<Sources />);
    SOURCE_GROUPS.forEach((group) => {
      group.sources.forEach((source) => {
        expect(screen.getByText(sourceLabel(source))).toBeInTheDocument();
      });
    });
  });

  it('uses the shared label for any source without a page-specific name', () => {
    SOURCE_GROUPS.forEach((group) => {
      group.sources.forEach((source) => {
        if (source.name) return;
        const shared = SOURCE_OPTIONS.find((o) => o.value === source.key)?.label;
        expect(sourceLabel(source)).toBe(shared);
      });
    });
  });

  it('links each source to its career page', () => {
    render(<Sources />);
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    SOURCE_GROUPS.forEach((group) => {
      group.sources.forEach((source) => {
        expect(hrefs).toContain(source.url);
      });
    });
  });
});
