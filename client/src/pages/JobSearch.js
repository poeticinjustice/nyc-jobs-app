import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  searchJobs,
  getJobCategories,
  setSearchParams,
  saveJob,
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
import { Link, useNavigate } from 'react-router-dom';

const JobSearch = () => {
  const dispatch = useDispatch();
  const { searchResults, categories, searchLoading, error, pagination } =
    useSelector((state) => state.jobs);
  const { isAuthenticated } = useSelector((state) => state.auth);
  const navigate = useNavigate();

  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [localSearchParams, setLocalSearchParams] = useState({
    q: '',
    category: '',
    location: '',
    salary_min: '',
    salary_max: '',
  });

  useEffect(() => {
    if (categories.length === 0) {
      dispatch(getJobCategories());
    }
  }, [dispatch, categories.length]);

  useEffect(() => {
    handleSearch();
  }, []);

  const handleSearch = (page = 1) => {
    setCurrentPage(page);
    const searchParamsWithPage = {
      ...localSearchParams,
      page,
      limit: 20,
    };
    dispatch(setSearchParams(searchParamsWithPage));
    dispatch(searchJobs(searchParamsWithPage));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setLocalSearchParams((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveJob = (jobId) => {
    if (isAuthenticated) {
      dispatch(saveJob(jobId));
    }
  };

  const handlePageChange = (newPage) => {
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
          <div className='flex gap-4'>
            <div className='flex-1'>
              <input
                type='text'
                name='q'
                placeholder='Search jobs by title or description...'
                value={localSearchParams.q}
                onChange={handleInputChange}
                className='input'
              />
            </div>
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
              <span className='ml-2'>Search</span>
            </button>
            <button
              type='button'
              onClick={() => setShowFilters(!showFilters)}
              className='btn btn-outline flex items-center'
            >
              <HiFilter className='h-5 w-5' />
              <span className='ml-2'>Filters</span>
            </button>
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

        {searchLoading ? (
          <div className='flex justify-center py-8'>
            <LoadingSpinner size='lg' />
          </div>
        ) : searchResults.length > 0 ? (
          <>
            <div className='space-y-4'>
              {searchResults.map((job, index) => (
                <div
                  key={job.job_id || job.jobId || `job-${index}`}
                  className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'
                >
                  <div className='flex justify-between items-start'>
                    <div className='flex-1'>
                      <h3 className='text-lg font-semibold text-gray-900 mb-2'>
                        {job.business_title}
                      </h3>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600'>
                        <div>
                          <p>
                            <strong>Category:</strong>{' '}
                            {job.job_category || 'Not specified'}
                          </p>
                          <p>
                            <strong>Location:</strong>{' '}
                            {job.work_location || 'Not specified'}
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
                          {job.job_description.substring(0, 200)}...
                        </p>
                      )}
                    </div>

                    <div className='flex flex-col items-end space-y-2 ml-4'>
                      {isAuthenticated && (
                        <button
                          onClick={() => handleSaveJob(job.job_id)}
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
        ) : (
          <div className='text-center py-8'>
            <p className='text-gray-500'>
              No jobs found. Try adjusting your search criteria.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobSearch;
