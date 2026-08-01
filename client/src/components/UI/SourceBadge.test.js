import { render, screen } from '@testing-library/react';
import { JOB_SOURCES } from 'nyc-jobs-shared/constants';
import SourceBadge from './SourceBadge';

describe('SourceBadge', () => {
  it('renders the full label at the default size', () => {
    render(<SourceBadge source='mountsinai' />);
    expect(screen.getByText('Mount Sinai')).toBeInTheDocument();
  });

  it('renders the short label at size="sm"', () => {
    render(<SourceBadge source='mountsinai' size='sm' />);
    expect(screen.getByText('Sinai')).toBeInTheDocument();
    expect(screen.queryByText('Mount Sinai')).not.toBeInTheDocument();
  });

  it('renders a known source with its configured colors', () => {
    render(<SourceBadge source='nyc' />);
    const badge = screen.getByText('NYC');
    expect(badge).toHaveClass('bg-green-100', 'text-green-800');
  });

  it('falls back to the raw source and neutral colors for an unknown source', () => {
    render(<SourceBadge source='definitely-not-a-source' />);
    const badge = screen.getByText('definitely-not-a-source');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-800');
  });

  it('has a label configured for every source the app can store', () => {
    // An unconfigured source falls through to rendering its raw key, e.g. "nychhc".
    JOB_SOURCES.forEach((source) => {
      const { unmount } = render(<SourceBadge source={source} />);
      expect(screen.queryByText(source)).not.toBeInTheDocument();
      unmount();
    });
  });
});
