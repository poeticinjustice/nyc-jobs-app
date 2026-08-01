import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pagination from './Pagination';

// The component renders two page-button groups (a 3-button mobile group and a
// 5-button desktop group) that are hidden from each other with CSS only, so in
// jsdom both are present. Collect the union of page numbers on screen.
const visiblePageNumbers = () => {
  const labels = screen
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label'))
    .filter((l) => /^Page \d+$/.test(l))
    .map((l) => Number(l.replace('Page ', '')));
  return [...new Set(labels)].sort((a, b) => a - b);
};

const setup = (props) => {
  const onPageChange = vi.fn();
  const utils = render(
    <Pagination
      currentPage={1}
      totalPages={10}
      total={200}
      pageSize={20}
      onPageChange={onPageChange}
      {...props}
    />
  );
  return { onPageChange, ...utils };
};

describe('Pagination', () => {
  it('renders nothing when there is only one page', () => {
    const { container } = setup({ totalPages: 1, total: 5 });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the first page window and the item range', () => {
    setup({ currentPage: 1 });

    expect(visiblePageNumbers()).toEqual([1, 2, 3, 4, 5]);
    expect(screen.getByText(/Showing 1 to 20 of 200 items/)).toBeInTheDocument();
  });

  it('uses a custom label for the item range', () => {
    setup({ currentPage: 2, label: 'jobs' });
    expect(screen.getByText(/Showing 21 to 40 of 200 jobs/)).toBeInTheDocument();
  });

  it('clamps the upper bound of the range on the last page', () => {
    setup({ currentPage: 10, total: 195 });
    expect(screen.getByText(/Showing 181 to 195 of 195 items/)).toBeInTheDocument();
  });

  it('slides the page window around the current page', () => {
    setup({ currentPage: 5 });
    expect(visiblePageNumbers()).toEqual([3, 4, 5, 6, 7]);
  });

  it('shows the last page window at the end', () => {
    setup({ currentPage: 10 });
    expect(visiblePageNumbers()).toEqual([6, 7, 8, 9, 10]);
  });

  it('marks the current page with aria-current', () => {
    setup({ currentPage: 3 });

    screen.getAllByLabelText('Page 3').forEach((btn) => {
      expect(btn).toHaveAttribute('aria-current', 'page');
    });
    screen.getAllByLabelText('Page 4').forEach((btn) => {
      expect(btn).not.toHaveAttribute('aria-current');
    });
  });

  it('disables Previous on the first page and enables Next', () => {
    setup({ currentPage: 1 });

    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).toBeEnabled();
  });

  it('disables Next on the last page and enables Previous', () => {
    setup({ currentPage: 10 });

    expect(screen.getByLabelText('Next page')).toBeDisabled();
    expect(screen.getByLabelText('Previous page')).toBeEnabled();
  });

  it('fires onPageChange with the neighbouring page for Previous/Next', async () => {
    const user = userEvent.setup();
    const { onPageChange } = setup({ currentPage: 5 });

    await user.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenLastCalledWith(6);

    await user.click(screen.getByLabelText('Previous page'));
    expect(onPageChange).toHaveBeenLastCalledWith(4);
    expect(onPageChange).toHaveBeenCalledTimes(2);
  });

  it('fires onPageChange with the clicked page number', async () => {
    const user = userEvent.setup();
    const { onPageChange } = setup({ currentPage: 1 });

    await user.click(screen.getAllByLabelText('Page 4')[0]);

    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('does not fire onPageChange when a disabled arrow is clicked', async () => {
    const user = userEvent.setup();
    const { onPageChange } = setup({ currentPage: 1 });

    await user.click(screen.getByLabelText('Previous page'));

    expect(onPageChange).not.toHaveBeenCalled();
  });
});
