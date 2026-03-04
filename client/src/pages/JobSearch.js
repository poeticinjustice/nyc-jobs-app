import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  searchJobs,
  clearSearchResults,
  saveJob,
  unsaveJob,
} from '../store/slices/jobsSlice';
import {
  getSavedSearches,
  saveSearch,
  deleteSavedSearch,
} from '../store/slices/searchesSlice';
import {
  HiSearch,
  HiBookmark,
  HiBookmarkAlt,
  HiStar,
  HiTrash,
} from 'react-icons/hi';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import SourceBadge from '../components/UI/SourceBadge';
import Pagination from '../components/UI/Pagination';
import { Link, useSearchParams } from 'react-router-dom';
import { formatSalary, formatDate } from '../utils/formatUtils';
import { stripHtml } from '../utils/textUtils';

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Most Recent First' },
  { value: 'date_asc', label: 'Oldest First' },
  { value: 'title_asc', label: 'Title A-Z' },
  { value: 'title_desc', label: 'Title Z-A' },
  { value: 'salary_desc', label: 'Highest Salary First' },
  { value: 'salary_asc', label: 'Lowest Salary First' },
];

const SOURCE_TABS = [
  { value: 'all', label: 'All Jobs' },
  { value: 'nyc', label: 'City' },
  { value: 'federal', label: 'Federal' },
];

const JobSearch = () => {
  const dispatch = useDispatch();
  const { searchResults, searchLoading, error, searchPagination: pagination } =
    useSelector((state) => state.jobs);
  const { isAuthenticated } = useSelector((state) => state.auth);
  const { savedSearches } = useSelector((state) => state.searches);
  const [searchParams, setSearchParams] = useSearchParams();

  const [currentPage, setCurrentPage] = useState(1);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [resultsPerPage, setResultsPerPage] = useState(20);
  const [showSaveSearchModal, setShowSaveSearchModal] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [showSavedSearches, setShowSavedSearches] = useState(false);

  // Initialize search params from URL or defaults
  const [localSearchParams, setLocalSearchParams] = useState({
    q: searchParams.get('q') || '',
    salary_min: searchParams.get('salary_min') || '',
    salary_max: searchParams.get('salary_max') || '',
    sort: searchParams.get('sort') || 'date_desc',
    source: searchParams.get('source') || 'all',
    limit: parseInt(searchParams.get('limit')) || 20,
  });

  // Track the active search (what's actually being searched for in results)
  const [activeSearchParams, setActiveSearchParams] = useState({
    q: searchParams.get('q') || '',
    salary_min: searchParams.get('salary_min') || '',
    salary_max: searchParams.get('salary_max') || '',
    sort: searchParams.get('sort') || 'date_desc',
    source: searchParams.get('source') || 'all',
    limit: parseInt(searchParams.get('limit')) || 20,
  });

  // Load saved searches on component mount
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(getSavedSearches());
    }
  }, [dispatch, isAuthenticated]);

  // Single source of truth: URL drives all searches
  useEffect(() => {
    const hasParams = Array.from(searchParams.values()).some((value) => value);

    if (hasParams) {
      const urlParams = {};
      searchParams.forEach((value, key) => {
        if (key === 'sort' || key === 'source' || value) {
          urlParams[key] = value;
        }
      });

      if (!urlParams.sort) urlParams.sort = 'date_desc';
      if (!urlParams.source) urlParams.source = 'all';

      const pageFromUrl = parseInt(urlParams.page) || 1;
      const limitFromUrl = parseInt(urlParams.limit) || 20;
      setCurrentPage(pageFromUrl);
      setResultsPerPage(limitFromUrl);

      setLocalSearchParams((prev) => ({
        ...prev,
        ...urlParams,
        limit: limitFromUrl,
      }));

      setActiveSearchParams({
        q: urlParams.q || '',
        salary_min: urlParams.salary_min || '',
        salary_max: urlParams.salary_max || '',
        sort: urlParams.sort,
        source: urlParams.source,
        limit: limitFromUrl,
      });

      dispatch(searchJobs({
        ...urlParams,
        page: pageFromUrl,
        limit: limitFromUrl,
      }));
    } else {
      dispatch(clearSearchResults());
      setActiveSearchParams({});
      setCurrentPage(1);
    }
  }, [searchParams, dispatch]);

  // Handle clicking outside sort dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showSortDropdown &&
        !event.target.closest('.sort-dropdown-container')
      ) {
        setShowSortDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSortDropdown]);

  const handleSearch = (page = 1) => {
    // Build URL params - the useEffect will handle dispatching the search
    const newSearchParams = new URLSearchParams();
    Object.entries(localSearchParams).forEach(([key, value]) => {
      if (
        key === 'sort' ||
        key === 'source' ||
        key === 'limit' ||
        (value && String(value).trim() !== '')
      ) {
        newSearchParams.set(key, String(value).trim() || value);
      }
    });
    newSearchParams.set('sort', localSearchParams.sort || 'date_desc');
    newSearchParams.set('source', localSearchParams.source || 'all');
    newSearchParams.set('page', page.toString());
    newSearchParams.set('limit', resultsPerPage.toString());

    setSearchParams(newSearchParams);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLocalSearchParams((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSourceChange = (source) => {
    setLocalSearchParams((prev) => ({ ...prev, source }));
    // Immediately trigger search with new source
    const newSearchParams = new URLSearchParams();
    Object.entries({ ...localSearchParams, source }).forEach(([key, value]) => {
      if (
        key === 'sort' ||
        key === 'source' ||
        key === 'limit' ||
        (value && String(value).trim() !== '')
      ) {
        newSearchParams.set(key, String(value).trim() || value);
      }
    });
    newSearchParams.set('sort', localSearchParams.sort || 'date_desc');
    newSearchParams.set('source', source);
    newSearchParams.set('page', '1');
    newSearchParams.set('limit', resultsPerPage.toString());
    setSearchParams(newSearchParams);
  };

  const handleSaveJob = (job) => {
    if (!isAuthenticated) return;

    if (job.isSaved) {
      if (window.confirm('Are you sure you want to remove this bookmark?')) {
        dispatch(unsaveJob({ jobId: job.jobId, source: job.source || 'nyc' }));
      }
    } else {
      dispatch(saveJob({ jobId: job.jobId, source: job.source || 'nyc' }));
    }
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', newPage.toString());
    setSearchParams(newParams);
    window.scrollTo(0, 0);
  };

  const handleResultsPerPageChange = (newLimit) => {
    setResultsPerPage(newLimit);
    setCurrentPage(1);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('limit', newLimit.toString());
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    handleSearch(1);
  };

  const handleSaveSearch = async () => {
    if (!saveSearchName.trim()) return;
    const criteria = {
      q: activeSearchParams.q || '',
      salary_min: activeSearchParams.salary_min || '',
      salary_max: activeSearchParams.salary_max || '',
      sort: activeSearchParams.sort || 'date_desc',
      source: activeSearchParams.source || 'all',
    };
    await dispatch(saveSearch({ name: saveSearchName.trim(), criteria }));
    setSaveSearchName('');
    setShowSaveSearchModal(false);
  };

  const handleLoadSavedSearch = (search) => {
    const { criteria } = search;
    const newParams = new URLSearchParams();
    if (criteria.q) newParams.set('q', criteria.q);
    if (criteria.salary_min) newParams.set('salary_min', criteria.salary_min);
    if (criteria.salary_max) newParams.set('salary_max', criteria.salary_max);
    newParams.set('sort', criteria.sort || 'date_desc');
    newParams.set('source', criteria.source || 'all');
    newParams.set('page', '1');
    newParams.set('limit', resultsPerPage.toString());
    setLocalSearchParams({
      q: criteria.q || '',
      salary_min: criteria.salary_min || '',
      salary_max: criteria.salary_max || '',
      sort: criteria.sort || 'date_desc',
      source: criteria.source || 'all',
      limit: resultsPerPage,
    });
    setSearchParams(newParams);
    setShowSavedSearches(false);
  };

  const handleDeleteSavedSearch = (id, e) => {
    e.stopPropagation();
    dispatch(deleteSavedSearch(id));
  };

  const totalPages = pagination?.pages || 0;

  const getSortDisplayName = (sortValue) =>
    SORT_OPTIONS.find((o) => o.value === sortValue)?.label || 'Most Recent First';

  return (
    <div className='space-y-6'>
      {/* Search Header */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <h1 className='text-2xl font-bold text-gray-900 mb-4'>
          Search Jobs
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
                localSearchParams.salary_min ||
                localSearchParams.salary_max ||
                localSearchParams.source !== 'all') && (
                <button
                  type='button'
                  onClick={() => {
                    setLocalSearchParams({
                      q: '',
                      salary_min: '',
                      salary_max: '',
                      sort: 'date_desc',
                      source: 'all',
                      limit: 20,
                    });
                    setResultsPerPage(20);
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
              {isAuthenticated && savedSearches.length > 0 && (
                <button
                  type='button'
                  onClick={() => setShowSavedSearches(!showSavedSearches)}
                  className='btn btn-outline flex items-center'
                >
                  <HiStar className='h-5 w-5' />
                  <span className='ml-2 hidden sm:inline'>Saved</span>
                </button>
              )}
            </div>
          </div>

          {/* Source Tabs */}
          <div className='flex gap-2'>
            {SOURCE_TABS.map((tab) => (
              <button
                key={tab.value}
                type='button'
                onClick={() => handleSourceChange(tab.value)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  localSearchParams.source === tab.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Salary Range */}
          <div className='flex items-center gap-3'>
            <span className='text-sm font-medium text-gray-700'>Salary:</span>
            <input
              type='number'
              name='salary_min'
              placeholder='Min'
              value={localSearchParams.salary_min}
              onChange={handleInputChange}
              className='input w-28'
            />
            <span className='text-sm text-gray-500'>to</span>
            <input
              type='number'
              name='salary_max'
              placeholder='Max'
              value={localSearchParams.salary_max}
              onChange={handleInputChange}
              className='input w-28'
            />
          </div>

          {/* Saved Searches Panel */}
          {showSavedSearches && savedSearches.length > 0 && (
            <div className='p-4 bg-yellow-50 rounded-lg border border-yellow-200'>
              <h3 className='text-sm font-medium text-gray-900 mb-2'>Saved Searches</h3>
              <div className='space-y-2'>
                {savedSearches.map((search) => (
                  <div
                    key={search._id}
                    onClick={() => handleLoadSavedSearch(search)}
                    className='flex items-center justify-between p-2 bg-white rounded-md border border-gray-200 cursor-pointer hover:border-primary-300 hover:bg-primary-50 transition-colors'
                  >
                    <div className='flex-1 min-w-0'>
                      <p className='text-sm font-medium text-gray-900 truncate'>
                        {search.name}
                      </p>
                      <div className='flex flex-wrap gap-1 mt-1'>
                        {search.criteria.q && (
                          <span className='px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs'>
                            {search.criteria.q}
                          </span>
                        )}
                        {search.criteria.source && search.criteria.source !== 'all' && (
                          <span className='px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs'>
                            {search.criteria.source === 'nyc' ? 'City' : 'Federal'}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSavedSearch(search._id, e)}
                      className='p-1 text-gray-400 hover:text-red-600 ml-2 flex-shrink-0'
                      title='Delete saved search'
                    >
                      <HiTrash className='h-4 w-4' />
                    </button>
                  </div>
                ))}
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

        {/* No Jobs Found */}
        {!searchResults.length &&
          !error &&
          !searchLoading &&
          (searchParams.get('q') ||
            searchParams.get('salary_min') ||
            searchParams.get('salary_max') ||
            searchParams.get('source')) && (
            <div className='bg-yellow-100 border border-yellow-300 rounded-lg p-4 mb-4'>
              <div className='text-center'>
                <p className='text-yellow-800 font-medium'>
                  No jobs found for your search criteria
                </p>
              </div>
            </div>
          )}

        {/* Welcome State */}
        {!searchResults.length &&
          !error &&
          !searchLoading &&
          !(
            searchParams.get('q') ||
            searchParams.get('salary_min') ||
            searchParams.get('salary_max') ||
            searchParams.get('source')
          ) && (
            <div className='bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-8 text-center'>
              <div className='mb-6'>
                <div className='mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4'>
                  <HiSearch className='h-8 w-8 text-blue-600' />
                </div>
                <h3 className='text-xl font-bold text-blue-900 mb-2'>
                  Ready to Search Jobs
                </h3>
                <p className='text-blue-700 max-w-md mx-auto'>
                  Search across NYC city and federal government jobs. Enter keywords, set a salary range, or click Search to see all available jobs.
                </p>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-sm'>
                <div className='bg-white/60 rounded-lg p-4'>
                  <div className='text-blue-600 font-medium mb-1'>
                    City + Federal
                  </div>
                  <div className='text-blue-700'>
                    NYC and US government jobs in one place
                  </div>
                </div>
                <div className='bg-white/60 rounded-lg p-4'>
                  <div className='text-blue-600 font-medium mb-1'>
                    Filter by Source
                  </div>
                  <div className='text-blue-700'>
                    Browse city or federal jobs separately
                  </div>
                </div>
                <div className='bg-white/60 rounded-lg p-4'>
                  <div className='text-blue-600 font-medium mb-1'>
                    Save Favorites
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
                    {pagination ? pagination.total.toLocaleString() : searchResults.length}
                  </span>{' '}
                  jobs found
                  {pagination && pagination.total > searchResults.length && (
                    <span className='ml-2'>
                      (showing {searchResults.length} of {pagination.total.toLocaleString()}{' '}
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
                          {SORT_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setLocalSearchParams((prev) => ({
                                  ...prev,
                                  sort: option.value,
                                }));
                                setShowSortDropdown(false);
                                const newParams = new URLSearchParams(
                                  searchParams
                                );
                                newParams.set('sort', option.value);
                                newParams.set('page', '1');
                                setSearchParams(newParams);
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

              {/* Current Search Parameters */}
              {(activeSearchParams.q ||
                activeSearchParams.salary_min ||
                activeSearchParams.salary_max ||
                (activeSearchParams.source && activeSearchParams.source !== 'all')) && (
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
                    {activeSearchParams.source && activeSearchParams.source !== 'all' && (
                      <span className='px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs'>
                        {activeSearchParams.source === 'nyc' ? 'City Jobs' : 'Federal Jobs'}
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
                    {isAuthenticated && (
                      <button
                        onClick={() => setShowSaveSearchModal(true)}
                        className='px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs hover:bg-yellow-200 transition-colors font-medium'
                      >
                        + Save this search
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Save Search Modal */}
            {showSaveSearchModal && (
              <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
                <div className='bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4'>
                  <h3 className='text-lg font-semibold text-gray-900 mb-4'>
                    Save Search
                  </h3>
                  <input
                    type='text'
                    placeholder='Give this search a name...'
                    value={saveSearchName}
                    onChange={(e) => setSaveSearchName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveSearch()}
                    className='input w-full mb-4'
                    autoFocus
                  />
                  <div className='flex justify-end space-x-2'>
                    <button
                      onClick={() => {
                        setShowSaveSearchModal(false);
                        setSaveSearchName('');
                      }}
                      className='px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50'
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveSearch}
                      disabled={!saveSearchName.trim()}
                      className='px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50'
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className='space-y-4'>
              {searchResults.map((job, index) => (
                <div
                  key={job.jobId || `job-${index}`}
                  className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'
                >
                  <div className='flex justify-between items-start'>
                    <div className='flex-1'>
                      <div className='flex items-center gap-2 mb-2'>
                        <h3 className='text-lg font-semibold text-gray-900'>
                          {job.businessTitle}
                        </h3>
                        <SourceBadge source={job.source} />
                      </div>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600'>
                        <div>
                          <p>
                            <strong>Category:</strong>{' '}
                            {job.jobCategory || 'Not specified'}
                          </p>
                          <p>
                            <strong>Location:</strong>{' '}
                            {job.workLocation || 'Not specified'}
                          </p>
                          <p>
                            <strong>Salary:</strong>{' '}
                            {formatSalary(
                              job.salaryRangeFrom,
                              job.salaryRangeTo,
                              job.salaryFrequency
                            )}
                          </p>
                        </div>
                        <div>
                          <p>
                            <strong>Posted:</strong>{' '}
                            {formatDate(job.postDate)}
                          </p>
                          <p>
                            <strong>Post Until:</strong>{' '}
                            {formatDate(job.postUntil) || 'Not specified'}
                          </p>
                          <p>
                            <strong>Process Date:</strong>{' '}
                            {formatDate(job.processDate) || 'Not specified'}
                          </p>
                        </div>
                      </div>
                      {job.jobDescription && (
                        <p className='mt-3 text-gray-700 line-clamp-2'>
                          {(() => {
                            const text = stripHtml(job.jobDescription);
                            return text.length > 200 ? text.substring(0, 200) + '...' : text;
                          })()}
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
                      to={`/job/${job.jobId}?source=${job.source || 'nyc'}`}
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
              <div className='space-y-0'>
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  total={pagination?.total || 0}
                  pageSize={resultsPerPage}
                  onPageChange={handlePageChange}
                  label='jobs'
                />

                {/* Results Per Page Selector - Desktop Only */}
                <div className='hidden md:block bg-white rounded-b-lg border border-t-0 border-gray-200 px-4 pb-4'>
                  <div className='flex justify-end'>
                    <div className='flex items-center gap-2'>
                      <label className='text-sm text-gray-600'>Show:</label>
                      <select
                        value={resultsPerPage}
                        onChange={(e) =>
                          handleResultsPerPageChange(parseInt(e.target.value))
                        }
                        className='px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500'
                      >
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span className='text-sm text-gray-600'>per page</span>
                    </div>
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
