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
import { cleanText, cleanTextForDisplay } from '../utils/textUtils';

const JobSearch = () => {
  const dispatch = useDispatch();
  const { searchResults, categories, searchLoading, error, pagination } =
    useSelector((state) => state.jobs);
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [searchParams, setSearchParams] = useSearchParams();

  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Initialize search params from URL or defaults
  const [localSearchParams, setLocalSearchParams] = useState({
    q: searchParams.get('q') || '',
    category: searchParams.get('category') || '',
    location: searchParams.get('location') || '',
    salary_min: searchParams.get('salary_min') || '',
    salary_max: searchParams.get('salary_max') || '',
    sort: searchParams.get('sort') || 'date_desc',
  });

  // Track the active search (what's actually being searched for in results)
  const [activeSearchParams, setActiveSearchParams] = useState({
    q: searchParams.get('q') || '',
    category: searchParams.get('category') || '',
    location: searchParams.get('location') || '',
    salary_min: searchParams.get('salary_min') || '',
    salary_max: searchParams.get('salary_max') || '',
    sort: searchParams.get('sort') || 'date_desc',
  });

  // Load categories on component mount
  useEffect(() => {
    if (categories.length === 0) {
      dispatch(getJobCategories());
    }
  }, [dispatch, categories.length]);

  // Handle URL parameter changes and initial load
  useEffect(() => {
    const hasParams = Array.from(searchParams.values()).some((value) => value);

    if (hasParams) {
      // Extract search parameters from URL
      const urlParams = {};
      searchParams.forEach((value, key) => {
        // Always include sort parameter, even if it's the default
        if (key === 'sort' || value) {
          urlParams[key] = value;
        }
      });

      // Ensure sort parameter has a default value if not present
      if (!urlParams.sort) {
        urlParams.sort = 'date_desc';
      }

      // Extract page parameter and update currentPage state
      const pageFromUrl = parseInt(urlParams.page) || 1;
      setCurrentPage(pageFromUrl);

      // Update local search params with URL values
      setLocalSearchParams((prev) => ({
        ...prev,
        ...urlParams,
      }));

      // Perform search with URL parameters
      const searchParamsWithPage = {
        ...urlParams,
        page: pageFromUrl,
        limit: 20,
      };

      dispatch(setReduxSearchParams(searchParamsWithPage));
      dispatch(searchJobs(searchParamsWithPage));
    } else {
      // No search parameters - clear results and don't auto-load
      dispatch(setReduxSearchParams({}));
      dispatch({ type: 'jobs/clearSearchResults' });
      setCurrentPage(1);
    }
  }, [searchParams, dispatch, setSearchParams, currentPage]);

  // Handle clicking outside sort dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showSortDropdown &&
        !event.target.closest('.sort-dropdown-container')
      ) {
        setShowSortDropdown(false);
      }
      if (showFilters && !event.target.closest('.filters-container')) {
        setShowFilters(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSortDropdown, showFilters]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // When user navigates back/forward, check if we have search params
      const currentParams = new URLSearchParams(window.location.search);
      const hasParams = Array.from(currentParams.values()).some(
        (value) => value
      );

      if (hasParams) {
        // Extract parameters and perform search
        const urlParams = {};
        currentParams.forEach((value, key) => {
          if (key === 'sort' || value) {
            urlParams[key] = value;
          }
        });

        // Ensure sort parameter has a default value
        if (!urlParams.sort) {
          urlParams.sort = 'date_desc';
        }

        // Update local search params and perform search
        setLocalSearchParams((prev) => ({
          ...prev,
          ...urlParams,
        }));

        const searchParamsWithPage = {
          ...urlParams,
          page: 1,
          limit: 20,
        };
        dispatch(setReduxSearchParams(searchParamsWithPage));
        dispatch(searchJobs(searchParamsWithPage));
        setCurrentPage(1);
      } else {
        // No search parameters - clear results
        dispatch({ type: 'jobs/clearSearchResults' });
        setCurrentPage(1);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [dispatch]);

  const handleSearch = (page = 1) => {
    setCurrentPage(page);

    // Check if this is an "empty search" (user wants to see all jobs)
    const hasSearchTerms = Object.values(localSearchParams).some(
      (value) => value && value.trim() !== ''
    );

    if (!hasSearchTerms) {
      // Empty search - load all jobs sorted by most recent
      dispatch(setReduxSearchParams({}));
      setActiveSearchParams({}); // Set empty search params for pagination logic
      dispatch(searchJobs({ page, limit: 20, sort: localSearchParams.sort }));

      // Clear URL parameters since we're showing all jobs
      setSearchParams(new URLSearchParams());
      return;
    }

    // Regular search with terms
    const searchParamsWithPage = {
      ...localSearchParams,
      page,
      limit: 20,
    };

    // Update active search params when search is actually performed
    setActiveSearchParams(localSearchParams);

    // Update URL with search parameters (only non-empty values, but always include sort and page)
    const newSearchParams = new URLSearchParams();
    Object.entries(localSearchParams).forEach(([key, value]) => {
      if (key === 'sort' || (value && value.trim() !== '')) {
        newSearchParams.set(key, value.trim() || value);
      }
    });
    // Always include the page parameter
    newSearchParams.set('page', page.toString());

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
    // Always include the page parameter, even for page 1
    newSearchParams.set('page', newPage.toString());
    setSearchParams(newSearchParams);

    // Update current page state immediately
    setCurrentPage(newPage);

    // Check if we're currently showing all jobs or filtered results
    const hasSearchTerms = Object.values(activeSearchParams).some(
      (value) => value && value.trim() !== ''
    );

    if (!hasSearchTerms) {
      // We're showing all jobs - just change page without full search
      dispatch(
        searchJobs({ page: newPage, limit: 20, sort: localSearchParams.sort })
      );
    } else {
      // We have search terms - use the regular search logic
      handleSearch(newPage);
    }
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

  const getSortDisplayName = (sortValue) => {
    switch (sortValue) {
      case 'date_desc':
        return 'Most Recent First';
      case 'date_asc':
        return 'Oldest First';
      case 'title_asc':
        return 'Title A-Z';
      case 'title_desc':
        return 'Title Z-A';
      case 'salary_desc':
        return 'Highest Salary First';
      case 'salary_asc':
        return 'Lowest Salary First';
      default:
        return 'Most Recent First';
    }
  };

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
                      sort: 'date_desc',
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
            <div className='grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg filters-container'>
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
                  category to get started. Or click Search to see all available
                  jobs.
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
        ) : searchResults.length > 0 ? (
          <>
            {/* Search Results Summary */}
            <div className='bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4'>
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
                <div className='text-sm text-gray-600'>
                  <span className='font-medium'>
                    {pagination ? pagination.total : searchResults.length}
                  </span>{' '}
                  jobs found
                  {pagination && (
                    <span className='ml-2'>
                      (showing {searchResults.length} of {pagination.total}{' '}
                      total)
                    </span>
                  )}
                </div>

                {/* Sort Button */}
                <div className='flex-shrink-0 sort-dropdown-container'>
                  <div className='relative'>
                    <button
                      type='button'
                      onClick={() => setShowSortDropdown(!showSortDropdown)}
                      className='flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500'
                    >
                      <span>
                        Sort:{' '}
                        {getSortDisplayName(
                          localSearchParams.sort || 'date_desc'
                        )}
                      </span>
                      <svg
                        className='w-4 h-4 text-gray-400'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M19 9l-7 7-7-7'
                        />
                      </svg>
                    </button>

                    {/* Sort Dropdown */}
                    {showSortDropdown && (
                      <div className='absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10'>
                        <div className='py-1'>
                          {[
                            { value: 'date_desc', label: 'Most Recent First' },
                            { value: 'date_asc', label: 'Oldest First' },
                            { value: 'title_asc', label: 'Title A-Z' },
                            { value: 'title_desc', label: 'Title Z-A' },
                            {
                              value: 'salary_desc',
                              label: 'Highest Salary First',
                            },
                            {
                              value: 'salary_asc',
                              label: 'Lowest Salary First',
                            },
                          ].map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setLocalSearchParams((prev) => ({
                                  ...prev,
                                  sort: option.value,
                                }));
                                setShowSortDropdown(false);
                                // Trigger search with new sort
                                const updatedParams = {
                                  ...localSearchParams,
                                  sort: option.value,
                                  page: 1,
                                };
                                dispatch(setReduxSearchParams(updatedParams));
                                dispatch(searchJobs(updatedParams));
                                setCurrentPage(1);
                              }}
                              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                                (localSearchParams.sort || 'date_desc') ===
                                option.value
                                  ? 'bg-primary-50 text-primary-700'
                                  : 'text-gray-700'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Current Search Parameters - Only show if there are actual search parameters */}
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
                        {cleanTextForDisplay(job.business_title)}
                      </h3>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600'>
                        <div>
                          <p>
                            <strong>Category:</strong>{' '}
                            {cleanTextForDisplay(job.job_category) ||
                              'Not specified'}
                          </p>
                          <p>
                            <strong>Location:</strong>{' '}
                            {cleanTextForDisplay(job.work_location) ||
                              'Not specified'}
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
                            <strong>Post Until:</strong>{' '}
                            {formatDate(job.post_until) || 'Not specified'}
                          </p>
                          <p>
                            <strong>Process Date:</strong>{' '}
                            {formatDate(job.process_date) || 'Not specified'}
                          </p>
                        </div>
                      </div>
                      {job.job_description && (
                        <p className='mt-3 text-gray-700 line-clamp-2'>
                          {cleanTextForDisplay(job.job_description).substring(
                            0,
                            200
                          )}
                          ...
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
