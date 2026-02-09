import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { getDashboard } from '../store/slices/dashboardSlice';
import {
  HiSearch,
  HiBookmark,
  HiDocumentText,
  HiStar,
  HiArrowRight,
} from 'react-icons/hi';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { formatSalary, formatDate } from '../utils/formatUtils';
import { STATUS_COLORS } from '../utils/statusConstants';

const Home = () => {
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const {
    statusCounts,
    totalSavedJobs,
    totalNotes,
    totalSavedSearches,
    recentSavedJobs,
    recentNotes,
    loading,
  } = useSelector((state) => state.dashboard);

  useEffect(() => {
    if (isAuthenticated) {
      dispatch(getDashboard());
    }
  }, [dispatch, isAuthenticated]);

  // --- Authenticated Dashboard ---
  if (isAuthenticated) {
    return (
      <div className='space-y-6'>
        {/* Welcome Header */}
        <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
          <h1 className='text-2xl font-bold text-gray-900'>
            Welcome back, {user?.firstName}!
          </h1>
          <p className='text-gray-600 mt-1'>
            Here's an overview of your job search progress.
          </p>
        </div>

        {loading && !statusCounts ? (
          <div className='flex justify-center py-8'>
            <LoadingSpinner size='lg' />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
              <Link
                to='/search'
                className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'
              >
                <div className='flex items-center'>
                  <div className='bg-blue-500 rounded-lg p-3 mr-4'>
                    <HiSearch className='h-6 w-6 text-white' />
                  </div>
                  <div>
                    <p className='text-sm text-gray-500'>Search Jobs</p>
                    <p className='text-lg font-semibold text-gray-900'>
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
                              {job.source === 'federal' ? (
                                <span className='shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800'>
                                  Fed
                                </span>
                              ) : (
                                <span className='shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800'>
                                  NYC
                                </span>
                              )}
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
      {/* Hero Section */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-8'>
        <div className='text-center'>
          <h1 className='text-4xl font-bold text-gray-900 mb-4'>
            Welcome to NYC Jobs
          </h1>
          <p className='text-xl text-gray-600 mb-8'>
            Discover and manage job opportunities in New York City government
          </p>
          <div className='space-y-4'>
            <p className='text-lg text-gray-700'>
              Create an account to save jobs and manage your applications
            </p>
            <div className='flex justify-center space-x-4'>
              <Link
                to='/register'
                className='inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700'
              >
                Get Started
              </Link>
              <Link
                to='/search'
                className='inline-flex items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50'
              >
                Browse Jobs
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-8'>
        <h2 className='text-2xl font-bold text-gray-900 mb-6'>Why NYC Jobs?</h2>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
          <div className='text-center'>
            <div className='bg-blue-100 rounded-lg p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center'>
              <HiSearch className='h-8 w-8 text-blue-600' />
            </div>
            <h3 className='text-lg font-medium text-gray-900 mb-2'>
              Comprehensive Search
            </h3>
            <p className='text-gray-600'>
              Search through thousands of NYC government job postings with
              advanced filters
            </p>
          </div>

          <div className='text-center'>
            <div className='bg-green-100 rounded-lg p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center'>
              <HiBookmark className='h-8 w-8 text-green-600' />
            </div>
            <h3 className='text-lg font-medium text-gray-900 mb-2'>
              Save & Track
            </h3>
            <p className='text-gray-600'>
              Save interesting jobs and track your application progress
            </p>
          </div>

          <div className='text-center'>
            <div className='bg-purple-100 rounded-lg p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center'>
              <HiDocumentText className='h-8 w-8 text-purple-600' />
            </div>
            <h3 className='text-lg font-medium text-gray-900 mb-2'>
              Notes & Organization
            </h3>
            <p className='text-gray-600'>
              Create notes for each job application to stay organized
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
