import { render, screen } from '@testing-library/react';
import NewBadge from './NewBadge';

describe('NewBadge', () => {
  it('renders the "New" pill', () => {
    render(<NewBadge />);
    const badge = screen.getByText('New');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-primary-100', 'text-primary-800');
  });

  it('uses the compact sizing at size="sm"', () => {
    render(<NewBadge size='sm' />);
    const badge = screen.getByText('New');
    expect(badge).toHaveClass('text-[10px]');
    expect(badge).not.toHaveClass('text-xs');
  });

  it('uses the default sizing otherwise', () => {
    render(<NewBadge />);
    const badge = screen.getByText('New');
    expect(badge).toHaveClass('text-xs');
    expect(badge).not.toHaveClass('text-[10px]');
  });
});
