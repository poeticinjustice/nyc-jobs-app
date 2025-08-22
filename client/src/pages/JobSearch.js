import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  searchJobs,
  getJobCategories,
  setSearchParams as setReduxSearchParams,
  saveJob,
  unsaveJob,
} from '../store/slices/jobsSlice';
import {
  HiSearch,
  HiFilter,
  HiBookmark,
  HiBookmarkAlt,
  HiChevronLeft,
  HiChevronRight,
} from 'react-icons/hi';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { Link, useSearchParams } from 'react-router-dom';
import { cleanText } from '../utils/textUtils';

const JobSearch = () => {
  const dispatch = useDispatch();
  const { searchResults, categories, searchLoading, error, pagination } =
    useSelector((state) => state.jobs);
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [searchParams, setSearchParams] = useSearchParams();

  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Initialize search params from URL or defaults
  const [localSearchParams, setLocalSearchParams] = useState({
    q: searchParams.get('q') || '',
    category: searchParams.get('category') || '',
    location: searchParams.get('location') || '',
    salary_min: searchParams.get('salary_min') || '',
    salary_max: searchParams.get('salary_max') || '',
  });

  // Track the active search (what's actually being searched for in results)
  const [activeSearchParams, setActiveSearchParams] = useState({
    q: searchParams.get('q') || '',
    category: searchParams.get('category') || '',
    location: searchParams.get('location') || '',
    salary_min: searchParams.get('salary_min') || '',
    salary_max: searchParams.get('salary_max') || '',
  });

  useEffect(() => {
    if (categories.length === 0) {
      dispatch(getJobCategories());
    }
  }, [dispatch, categories.length]);

  // Sync URL parameters with local state and handle initial search
  useEffect(() => {
    const urlParams = {
      q: searchParams.get('q') || '',
      category: searchParams.get('category') || '',
      location: searchParams.get('location') || '',
      salary_min: searchParams.get('salary_min') || '',
      salary_max: searchParams.get('salary_max') || '',
    };

    // Update local state if URL params changed
    setLocalSearchParams(urlParams);
    setActiveSearchParams(urlParams);

    // If we have search parameters in URL, perform search
    const hasSearchParams = Object.values(urlParams).some((value) => value);
    if (hasSearchParams) {
      const page = parseInt(searchParams.get('page')) || 1;
      setCurrentPage(page);
      // Use dispatch directly to avoid dependency issues
      const searchParamsWithPage = {
        ...urlParams,
        page,
        limit: 20,
      };
      dispatch(setReduxSearchParams(searchParamsWithPage));
      dispatch(searchJobs(searchParamsWithPage));
    } else {
      // Clear search results if no URL parameters
      dispatch(setReduxSearchParams({}));
      // Clear search results from Redux store
      dispatch({ type: 'jobs/clearSearchResults' });
      setCurrentPage(1);
    }
  }, [searchParams, dispatch, setSearchParams]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // When user navigates back/forward, check if we have search params
      const currentParams = new URLSearchParams(window.location.search);
      const hasParams = Array.from(currentParams.values()).some(
        (value) => value
      );

      if (!hasParams) {
        // Clear search results if no URL parameters
        dispatch({ type: 'jobs/clearSearchResults' });
        setCurrentPage(1);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [dispatch]);

  const handleSearch = (page = 1) => {
    setCurrentPage(page);
    const searchParamsWithPage = {
      ...localSearchParams,
      page,
      limit: 20,
    };

    // Update active search params when search is actually performed
    setActiveSearchParams(localSearchParams);

    // Update URL with search parameters (only non-empty values)
    const newSearchParams = new URLSearchParams();
    Object.entries(localSearchParams).forEach(([key, value]) => {
      if (value && value.trim() !== '') {
        newSearchParams.set(key, value.trim());
      }
    });
    if (page > 1) newSearchParams.set('page', page.toString());

    setSearchParams(newSearchParams);

    dispatch(setReduxSearchParams(searchParamsWithPage));
    dispatch(searchJobs(searchParamsWithPage));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLocalSearchParams((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveJob = (job) => {
    if (!isAuthenticated) return;

    if (job.isSaved) {
      // Job is already saved, show confirmation dialog
      if (window.confirm('Are you sure you want to remove this bookmark?')) {
        dispatch(unsaveJob(job.job_id));
      }
    } else {
      // Job is not saved, save it
      dispatch(saveJob(job.job_id));
    }
  };

  const handlePageChange = (newPage) => {
    // Update URL with new page number
    const newSearchParams = new URLSearchParams(searchParams);
    if (newPage > 1) {
      newSearchParams.set('page', newPage.toString());
    } else {
      newSearchParams.delete('page');
    }
    setSearchParams(newSearchParams);

    handleSearch(newPage);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    handleSearch(1);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setLocalSearchParams((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFilterSearch = () => {
    handleSearch(1);
  };

  const formatSalary = (from, to, frequency) => {
    if (from && to) {
      return `$${from.toLocaleString()} - $${to.toLocaleString()} ${
        frequency || ''
      }`;
    } else if (from) {
      return `$${from.toLocaleString()} ${frequency || ''}`;
    }
    return 'Salary not specified';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Date not specified';
    return new Date(dateString).toLocaleDateString();
  };

  const totalPages = pagination
    ? Math.ceil(pagination.total / pagination.limit)
    : 0;

  return (
    <div className='space-y-6'>
      {/* Search Header */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <h1 className='text-2xl font-bold text-gray-900 mb-4'>
          Search NYC Jobs
        </h1>

        {/* Search Form */}
        <form onSubmit={handleSearchSubmit} className='space-y-4'>
          <div className='flex flex-col sm:flex-row gap-4'>
            <div className='flex-1'>
              <input
                type='text'
                name='q'
                placeholder='Search jobs by title or description...'
                value={localSearchParams.q}
                onChange={handleInputChange}
                className='input w-full'
              />
            </div>
            <div className='flex gap-2 sm:gap-4'>
              <button
                type='submit'
                disabled={searchLoading}
                className='btn btn-primary flex items-center'
              >
                {searchLoading ? (
                  <LoadingSpinner size='sm' />
                ) : (
                  <HiSearch className='h-5 w-5' />
                )}
                <span className='ml-2 hidden sm:inline'>Search</span>
              </button>
              {(localSearchParams.q ||
                localSearchParams.category ||
                localSearchParams.location ||
                localSearchParams.salary_min ||
                localSearchParams.salary_max) && (
                <button
                  type='button'
                  onClick={() => {
                    setLocalSearchParams({
                      q: '',
                      category: '',
                      location: '',
                      salary_min: '',
                      salary_max: '',
                    });
                    setSearchParams(new URLSearchParams());
                    setCurrentPage(1);
                  }}
                  className='p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors'
                  title='Clear all search filters'
                >
                  <svg
                    className='w-4 h-4'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M6 18L18 6M6 6l12 12'
                    />
                  </svg>
                </button>
              )}
              <button
                type='button'
                onClick={() => setShowFilters(!showFilters)}
                className='btn btn-outline flex items-center'
              >
                <HiFilter className='h-5 w-5' />
                <span className='ml-2 hidden sm:inline'>Filters</span>
              </button>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className='grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg'>
              <div>
                <label className='block text-sm font-medium text-gray-700 mb-1'>
                  Category
                </label>
                <select
                  name='category'
                  value={localSearchParams.category}
                  onChange={handleFilterChange}
                  className='input'
                >
                  <option value=''>All Categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 mb-1'>
                  Location
                </label>
                <input
                  type='text'
                  name='location'
                  placeholder='Work location...'
                  value={localSearchParams.location}
                  onChange={handleFilterChange}
                  className='input'
                />
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 mb-1'>
                  Min Salary
                </label>
                <input
                  type='number'
                  name='salary_min'
                  placeholder='Min salary...'
                  value={localSearchParams.salary_min}
                  onChange={handleFilterChange}
                  className='input'
                />
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 mb-1'>
                  Max Salary
                </label>
                <input
                  type='number'
                  name='salary_max'
                  placeholder='Max salary...'
                  value={localSearchParams.salary_max}
                  onChange={handleFilterChange}
                  className='input'
                />
              </div>

              <div className='md:col-span-4'>
                <button
                  type='button'
                  onClick={handleFilterSearch}
                  disabled={searchLoading}
                  className='btn btn-primary'
                >
                  Apply Filters
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Search Results */}
      <div className='space-y-4'>
        {error && (
          <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
            <p className='text-red-800'>{error}</p>
          </div>
        )}

        {/* No Jobs Found - Show above welcome screen when there are search params but no results */}
        {!searchResults.length &&
          !error &&
          !searchLoading &&
          (searchParams.get('q') ||
            searchParams.get('category') ||
            searchParams.get('location') ||
            searchParams.get('salary_min') ||
            searchParams.get('salary_max')) && (
            <div className='bg-yellow-100 border border-yellow-300 rounded-lg p-4 mb-4'>
              <div className='text-center'>
                <p className='text-yellow-800 font-medium'>
                  No jobs found for your search criteria
                </p>
              </div>
            </div>
          )}

        {/* Welcome State - Ready to Search */}
        {!searchResults.length &&
          !error &&
          !searchLoading &&
          !(
            searchParams.get('q') ||
            searchParams.get('category') ||
            searchParams.get('location') ||
            searchParams.get('salary_min') ||
            searchParams.get('salary_max')
          ) && (
            <div className='bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-8 text-center'>
              <div className='mb-6'>
                <div className='mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4'>
                  <HiSearch className='h-8 w-8 text-blue-600' />
                </div>
                <h3 className='text-xl font-bold text-blue-900 mb-2'>
                  Ready to Search NYC Jobs
                </h3>
                <p className='text-blue-700 max-w-md mx-auto'>
                  Search through thousands of current job listings from NYC
                  government agencies. Enter keywords, job titles, or browse by
                  category to get started.
                </p>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-sm'>
                <div className='bg-white/60 rounded-lg p-4'>
                  <div className='text-blue-600 font-medium mb-1'>
                    ⚡ Instant Search
                  </div>
                  <div className='text-blue-700'>
                    No waiting - search immediately
                  </div>
                </div>
                <div className='bg-white/60 rounded-lg p-4'>
                  <div className='text-blue-600 font-medium mb-1'>
                    🔍 Smart Results
                  </div>
                  <div className='text-blue-700'>
                    Comprehensive job matching
                  </div>
                </div>
                <div className='bg-white/60 rounded-lg p-4'>
                  <div className='text-blue-600 font-medium mb-1'>
                    💾 Save Favorites
                  </div>
                  <div className='text-blue-700'>
                    Bookmark jobs you're interested in
                  </div>
                </div>
              </div>
            </div>
          )}

        {searchLoading ? (
          <div className='flex justify-center py-8'>
            <LoadingSpinner size='lg' />
          </div>
        ) : searchResults.length > 0 &&
          (searchParams.get('q') ||
            searchParams.get('category') ||
            searchParams.get('location') ||
            searchParams.get('salary_min') ||
            searchParams.get('salary_max')) ? (
          <>
            {/* Search Results Summary */}
            <div className='bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4'>
              <div className='flex items-center justify-between'>
                <div className='text-sm text-gray-600'>
                  <span className='font-medium'>{searchResults.length}</span>{' '}
                  jobs found
                  {pagination && (
                    <span className='ml-2'>
                      (showing {searchResults.length} of {pagination.total}{' '}
                      total)
                    </span>
                  )}
                </div>
                <div className='text-xs text-gray-500'>
                  <span className='text-blue-600'>
                    🔍 Smart Search (Auto-optimized)
                  </span>
                </div>
              </div>

              {/* Current Search Parameters */}
              {(activeSearchParams.q ||
                activeSearchParams.category ||
                activeSearchParams.location ||
                activeSearchParams.salary_min ||
                activeSearchParams.salary_max) && (
                <div className='mt-3 pt-3 border-t border-gray-200'>
                  <div className='text-xs text-gray-500 mb-2'>
                    Current search:
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {activeSearchParams.q && (
                      <span className='px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs'>
                        Keywords: {activeSearchParams.q}
                      </span>
                    )}
                    {activeSearchParams.category && (
                      <span className='px-2 py-1 bg-green-100 text-green-700 rounded text-xs'>
                        Category: {activeSearchParams.category}
                      </span>
                    )}
                    {activeSearchParams.location && (
                      <span className='px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs'>
                        Location: {activeSearchParams.location}
                      </span>
                    )}
                    {activeSearchParams.salary_min && (
                      <span className='px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs'>
                        Min Salary: ${activeSearchParams.salary_min}
                      </span>
                    )}
                    {activeSearchParams.salary_max && (
                      <span className='px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs'>
                        Max Salary: ${activeSearchParams.salary_max}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className='space-y-4'>
              {searchResults.map((job, index) => (
                <div
                  key={job.job_id || job.jobId || `job-${index}`}
                  className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'
                >
                  <div className='flex justify-between items-start'>
                    <div className='flex-1'>
                      <h3 className='text-lg font-semibold text-gray-900 mb-2'>
                        {cleanText(job.business_title)}
                      </h3>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600'>
                        <div>
                          <p>
                            <strong>Category:</strong>{' '}
                            {cleanText(job.job_category) || 'Not specified'}
                          </p>
                          <p>
                            <strong>Location:</strong>{' '}
                            {cleanText(job.work_location) || 'Not specified'}
                          </p>
                          <p>
                            <strong>Salary:</strong>{' '}
                            {formatSalary(
                              job.salary_range_from,
                              job.salary_range_to,
                              job.salary_frequency
                            )}
                          </p>
                        </div>
                        <div>
                          <p>
                            <strong>Posted:</strong>{' '}
                            {formatDate(job.posting_date)}
                          </p>
                          <p>
                            <strong>Type:</strong>{' '}
                            {job.full_time_part_time_indicator ||
                              'Not specified'}
                          </p>
                          <p>
                            <strong>Level:</strong>{' '}
                            {job.level || 'Not specified'}
                          </p>
                        </div>
                      </div>
                      {job.job_description && (
                        <p className='mt-3 text-gray-700 line-clamp-2'>
                          {cleanText(job.job_description).substring(0, 200)}...
                        </p>
                      )}
                    </div>

                    <div className='flex flex-col items-end space-y-2 ml-4'>
                      {isAuthenticated && (
                        <button
                          onClick={() => handleSaveJob(job)}
                          className='p-2 text-gray-400 hover:text-primary-600 transition-colors'
                          title={job.isSaved ? 'Remove from saved' : 'Save job'}
                        >
                          {job.isSaved ? (
                            <HiBookmarkAlt className='h-5 w-5 text-primary-600' />
                          ) : (
                            <HiBookmark className='h-5 w-5' />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className='mt-4 pt-4 border-t border-gray-200'>
                    <Link
                      to={`/job/${job.job_id}`}
                      className='text-primary-600 hover:text-primary-700 font-medium inline-block'
                    >
                      View Details →
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-4'>
                <div className='flex items-center justify-between'>
                  <div className='text-sm text-gray-600'>
                    Showing page {currentPage} of {totalPages}
                    {pagination && (
                      <span className='ml-2'>
                        ({pagination.total} total jobs)
                      </span>
                    )}
                  </div>

                  <div className='flex items-center space-x-2'>
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage <= 1}
                      className='p-2 text-gray-400 hover:text-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                      title='Previous page'
                    >
                      <HiChevronLeft className='h-5 w-5' />
                    </button>

                    <div className='flex items-center space-x-1'>
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
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
                              onClick={() => handlePageChange(pageNum)}
                              className={`px-3 py-1 text-sm rounded ${
                                currentPage === pageNum
                                  ? 'bg-primary-600 text-white'
                                  : 'text-gray-600 hover:text-primary-600'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        }
                      )}
                    </div>

                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                      className='p-2 text-gray-400 hover:text-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                      title='Next page'
                    >
                      <HiChevronRight className='h-5 w-5' />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default JobSearch;
