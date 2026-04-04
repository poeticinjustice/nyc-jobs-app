import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { getDashboard } from '../store/slices/dashboardSlice';
import {
  HiSearch,
  HiBookmark,
  HiDocumentText,
  HiStar,
  HiArrowRight,
  HiLocationMarker,
} from 'react-icons/hi';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import SourceBadge from '../components/UI/SourceBadge';
import { formatSalary, formatDate } from '../utils/formatUtils';
import { STATUS_COLORS } from '../utils/statusConstants';

const Home = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const {
    statusCounts,
    totalSavedJobs,
    totalNotes,
    totalSavedSearches,
    recentSavedJobs,
    recentNotes,
    loading,
    error: dashboardError,
  } = useSelector((state) => state.dashboard);

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      dispatch(getDashboard());
    }
  }, [dispatch, isAuthenticated]);

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    }
    params.set('sort', 'date_desc');
    params.set('source', 'all');
    params.set('page', '1');
    params.set('limit', '20');
    navigate(`/search?${params.toString()}`);
  };

  const handleBrowseAll = () => {
    navigate('/search?sort=date_desc&source=all&page=1&limit=20');
  };

  // --- Authenticated Dashboard ---
  if (isAuthenticated) {
    return (
      <div className='space-y-6'>
        {/* Welcome + Search */}
        <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
          <h1 className='text-2xl font-bold text-gray-900'>
            Welcome back, {user?.firstName}!
          </h1>
          <p className='text-gray-600 mt-1 mb-4'>
            Here's an overview of your job search progress.
          </p>
          <form onSubmit={handleSearch} className='flex gap-3'>
            <input
              type='text'
              placeholder='Search jobs by title, keyword, or agency...'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className='input flex-1'
            />
            <button type='submit' className='btn btn-primary flex items-center'>
              <HiSearch className='h-5 w-5' />
              <span className='ml-2 hidden sm:inline'>Search</span>
            </button>
            <button
              type='button'
              onClick={handleBrowseAll}
              className='btn btn-outline hidden sm:flex items-center'
            >
              Browse All
            </button>
          </form>
        </div>

        {dashboardError && (
          <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
            <p className='text-red-800'>{dashboardError}</p>
          </div>
        )}

        {loading && !statusCounts ? (
          <div className='flex justify-center py-8'>
            <LoadingSpinner size='lg' />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
              <Link
                to='/search?sort=date_desc&source=all&page=1&limit=20'
                className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'
              >
                <div className='flex items-center'>
                  <div className='bg-blue-500 rounded-lg p-3 mr-4'>
                    <HiSearch className='h-6 w-6 text-white' />
                  </div>
                  <div className='min-w-0'>
                    <p className='text-sm text-gray-500'>Search Jobs</p>
                    <p className='text-lg font-semibold text-gray-900 truncate'>
                      Find new opportunities
                    </p>
                  </div>
                </div>
              </Link>

              <Link
                to='/saved'
                className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'
              >
                <div className='flex items-center'>
                  <div className='bg-green-500 rounded-lg p-3 mr-4'>
                    <HiBookmark className='h-6 w-6 text-white' />
                  </div>
                  <div>
                    <p className='text-sm text-gray-500'>Saved Jobs</p>
                    <p className='text-2xl font-bold text-gray-900'>
                      {totalSavedJobs}
                    </p>
                  </div>
                </div>
              </Link>

              <Link
                to='/notes'
                className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'
              >
                <div className='flex items-center'>
                  <div className='bg-purple-500 rounded-lg p-3 mr-4'>
                    <HiDocumentText className='h-6 w-6 text-white' />
                  </div>
                  <div>
                    <p className='text-sm text-gray-500'>Notes</p>
                    <p className='text-2xl font-bold text-gray-900'>
                      {totalNotes}
                    </p>
                  </div>
                </div>
              </Link>

              <Link
                to='/search'
                className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'
              >
                <div className='flex items-center'>
                  <div className='bg-yellow-500 rounded-lg p-3 mr-4'>
                    <HiStar className='h-6 w-6 text-white' />
                  </div>
                  <div>
                    <p className='text-sm text-gray-500'>Saved Searches</p>
                    <p className='text-2xl font-bold text-gray-900'>
                      {totalSavedSearches}
                    </p>
                  </div>
                </div>
              </Link>
            </div>

            {/* Application Pipeline */}
            {statusCounts && totalSavedJobs > 0 && (
              <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                <div className='flex justify-between items-center mb-4'>
                  <h2 className='text-lg font-semibold text-gray-900'>
                    Application Pipeline
                  </h2>
                  <Link
                    to='/saved'
                    className='text-sm text-primary-600 hover:text-primary-700 font-medium'
                  >
                    View all
                  </Link>
                </div>
                <div className='space-y-3'>
                  {Object.entries(STATUS_COLORS).map(([status, colors]) => {
                    const count = statusCounts[status] || 0;
                    const pct =
                      totalSavedJobs > 0
                        ? Math.round((count / totalSavedJobs) * 100)
                        : 0;
                    return (
                      <Link
                        key={status}
                        to={`/saved?status=${status}`}
                        className='block'
                      >
                        <div className='flex items-center justify-between mb-1'>
                          <span className='text-sm font-medium text-gray-700 capitalize'>
                            {status}
                          </span>
                          <span className='text-sm text-gray-500'>
                            {count}
                          </span>
                        </div>
                        <div className='w-full bg-gray-100 rounded-full h-2'>
                          <div
                            className={`${colors.bar} h-2 rounded-full transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Two-column: Recent Saved Jobs + Recent Notes */}
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              {/* Recent Saved Jobs */}
              <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                <div className='flex justify-between items-center mb-4'>
                  <h2 className='text-lg font-semibold text-gray-900'>
                    Recent Saved Jobs
                  </h2>
                  <Link
                    to='/saved'
                    className='text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center'
                  >
                    View all <HiArrowRight className='ml-1 h-4 w-4' />
                  </Link>
                </div>
                {recentSavedJobs.length > 0 ? (
                  <div className='space-y-3'>
                    {recentSavedJobs.map((job) => (
                      <Link
                        key={job.jobId}
                        to={`/job/${job.jobId}?source=${job.source || 'nyc'}`}
                        className='block p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors'
                      >
                        <div className='flex justify-between items-start'>
                          <div className='flex-1 min-w-0'>
                            <div className='flex items-center gap-2'>
                              <p className='text-sm font-medium text-gray-900 truncate'>
                                {job.businessTitle}
                              </p>
                              <SourceBadge source={job.source} size='sm' />
                            </div>
                            <p className='text-xs text-gray-500 mt-1'>
                              {job.agency || job.workLocation || 'NYC Government'}
                            </p>
                          </div>
                          <span
                            className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                              STATUS_COLORS[job.applicationStatus]?.bg || 'bg-gray-100'
                            } ${STATUS_COLORS[job.applicationStatus]?.text || 'text-gray-800'}`}
                          >
                            {job.applicationStatus}
                          </span>
                        </div>
                        <p className='text-xs text-gray-500 mt-1'>
                          {formatSalary(
                            job.salaryRangeFrom,
                            job.salaryRangeTo,
                            job.salaryFrequency
                          )}
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className='text-sm text-gray-500'>
                    No saved jobs yet.{' '}
                    <Link to='/search' className='text-primary-600 hover:text-primary-700'>
                      Start searching
                    </Link>
                  </p>
                )}
              </div>

              {/* Recent Notes */}
              <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                <div className='flex justify-between items-center mb-4'>
                  <h2 className='text-lg font-semibold text-gray-900'>
                    Recent Notes
                  </h2>
                  <Link
                    to='/notes'
                    className='text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center'
                  >
                    View all <HiArrowRight className='ml-1 h-4 w-4' />
                  </Link>
                </div>
                {recentNotes.length > 0 ? (
                  <div className='space-y-3'>
                    {recentNotes.map((note) => (
                      <div
                        key={note._id}
                        className='p-3 rounded-lg border border-gray-100'
                      >
                        <div className='flex justify-between items-start'>
                          <p className='text-sm font-medium text-gray-900 truncate flex-1'>
                            {note.title}
                          </p>
                          <span
                            className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                              note.priority === 'urgent'
                                ? 'bg-red-100 text-red-800'
                                : note.priority === 'high'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {note.priority}
                          </span>
                        </div>
                        <div className='flex items-center mt-1 text-xs text-gray-500'>
                          <span className='capitalize'>{note.type}</span>
                          <span className='mx-1'>&middot;</span>
                          <span>{formatDate(note.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className='text-sm text-gray-500'>
                    No notes yet. Add notes from job details pages.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // --- Guest Landing Page ---
  return (
    <div className='space-y-8'>
      {/* Hero + Search */}
      <div className='bg-gradient-to-br from-primary-600 to-primary-800 rounded-lg shadow-lg p-8 text-white'>
        <div className='text-center max-w-2xl mx-auto'>
          <h1 className='text-3xl sm:text-4xl font-bold mb-3'>
            Find Your Next Government Job
          </h1>
          <p className='text-primary-100 text-lg mb-6'>
            Search thousands of NYC city and federal government positions
          </p>

          <form onSubmit={handleSearch} className='max-w-xl mx-auto'>
            <div className='flex gap-2'>
              <input
                type='text'
                placeholder='Job title, keyword, or agency...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='input flex-1 min-w-0 text-gray-900'
              />
              <button
                type='submit'
                className='px-5 py-2.5 bg-white text-primary-700 font-semibold rounded-lg hover:bg-primary-50 transition-colors flex items-center'
              >
                <HiSearch className='h-5 w-5' />
                <span className='ml-2 hidden sm:inline'>Search</span>
              </button>
            </div>
          </form>

          <button
            onClick={handleBrowseAll}
            className='mt-4 text-primary-200 hover:text-white text-sm font-medium underline underline-offset-2 transition-colors'
          >
            Or browse all available jobs
          </button>
        </div>
      </div>

      {/* Quick Links */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
        <button
          onClick={handleBrowseAll}
          className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow text-left'
        >
          <div className='bg-blue-100 rounded-lg p-3 w-12 h-12 flex items-center justify-center mb-3'>
            <HiSearch className='h-6 w-6 text-blue-600' />
          </div>
          <h3 className='text-lg font-medium text-gray-900 mb-1'>
            Browse Jobs
          </h3>
          <p className='text-sm text-gray-600'>
            Search thousands of NYC and federal government postings
          </p>
        </button>

        <Link
          to='/map'
          className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'
        >
          <div className='bg-green-100 rounded-lg p-3 w-12 h-12 flex items-center justify-center mb-3'>
            <HiLocationMarker className='h-6 w-6 text-green-600' />
          </div>
          <h3 className='text-lg font-medium text-gray-900 mb-1'>
            Job Map
          </h3>
          <p className='text-sm text-gray-600'>
            Explore jobs by location on an interactive map
          </p>
        </Link>

        <Link
          to='/register'
          className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'
        >
          <div className='bg-purple-100 rounded-lg p-3 w-12 h-12 flex items-center justify-center mb-3'>
            <HiBookmark className='h-6 w-6 text-purple-600' />
          </div>
          <h3 className='text-lg font-medium text-gray-900 mb-1'>
            Save & Track
          </h3>
          <p className='text-sm text-gray-600'>
            Create an account to save jobs and track applications
          </p>
        </Link>
      </div>
    </div>
  );
};

export default Home;
