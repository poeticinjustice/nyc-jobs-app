import React from 'react';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi';

const Pagination = ({ currentPage, totalPages, total, pageSize, onPageChange, label = 'items' }) => {
  if (totalPages <= 1) return null;

  return (
    <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-4'>
      <div className='flex items-center justify-between'>
        <div className='text-sm text-gray-700'>
          Showing {(currentPage - 1) * pageSize + 1} to{' '}
          {Math.min(currentPage * pageSize, total)} of {total} {label}
        </div>

        <div className='flex items-center space-x-2'>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className={`p-2 rounded-lg border transition-colors ${
              currentPage <= 1
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300'
            }`}
          >
            <HiChevronLeft className='h-5 w-5' />
          </button>

          <div className='flex items-center space-x-1'>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`px-3 py-2 rounded-lg border transition-colors ${
                    pageNum === currentPage
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className={`p-2 rounded-lg border transition-colors ${
              currentPage >= totalPages
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300'
            }`}
          >
            <HiChevronRight className='h-5 w-5' />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
