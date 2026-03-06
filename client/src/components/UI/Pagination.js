import React from 'react';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi';

const getPageNumbers = (currentPage, totalPages, maxButtons) => {
  const half = Math.floor(maxButtons / 2);
  const count = Math.min(maxButtons, totalPages);
  return Array.from({ length: count }, (_, i) => {
    if (totalPages <= maxButtons) return i + 1;
    if (currentPage <= half + 1) return i + 1;
    if (currentPage >= totalPages - half) return totalPages - maxButtons + 1 + i;
    return currentPage - half + i;
  });
};

const PageButton = ({ pageNum, isCurrent, onClick }) => (
  <button
    onClick={() => onClick(pageNum)}
    aria-label={`Page ${pageNum}`}
    aria-current={isCurrent ? 'page' : undefined}
    className={`px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm rounded-lg border transition-colors ${
      isCurrent
        ? 'bg-primary-600 text-white border-primary-600'
        : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300'
    }`}
  >
    {pageNum}
  </button>
);

const Pagination = ({ currentPage, totalPages, total, pageSize, onPageChange, label = 'items' }) => {
  if (totalPages <= 1) return null;

  const pages5 = getPageNumbers(currentPage, totalPages, 5);
  const pages3 = getPageNumbers(currentPage, totalPages, 3);

  return (
    <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4'>
      <div className='flex flex-col sm:flex-row items-center gap-2 sm:justify-between'>
        <div className='text-xs sm:text-sm text-gray-700' aria-live='polite'>
          Showing {(currentPage - 1) * pageSize + 1} to{' '}
          {Math.min(currentPage * pageSize, total)} of {total} {label}
        </div>

        <div className='flex items-center space-x-1 sm:space-x-2'>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label='Previous page'
            className={`p-1.5 sm:p-2 rounded-lg border transition-colors ${
              currentPage <= 1
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300'
            }`}
          >
            <HiChevronLeft className='h-4 w-4 sm:h-5 sm:w-5' />
          </button>

          {/* Mobile: 3 buttons */}
          <div className='flex sm:hidden items-center space-x-1'>
            {pages3.map((pageNum) => (
              <PageButton key={pageNum} pageNum={pageNum} isCurrent={pageNum === currentPage} onClick={onPageChange} />
            ))}
          </div>
          {/* Desktop: 5 buttons */}
          <div className='hidden sm:flex items-center space-x-1'>
            {pages5.map((pageNum) => (
              <PageButton key={pageNum} pageNum={pageNum} isCurrent={pageNum === currentPage} onClick={onPageChange} />
            ))}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label='Next page'
            className={`p-1.5 sm:p-2 rounded-lg border transition-colors ${
              currentPage >= totalPages
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300'
            }`}
          >
            <HiChevronRight className='h-4 w-4 sm:h-5 sm:w-5' />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
