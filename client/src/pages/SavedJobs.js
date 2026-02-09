import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  getSavedJobs,
  unsaveJob,
  updateJobStatus,
  setStatusFilter,
} from '../store/slices/jobsSlice';
import {
  HiBookmarkAlt,
  HiPlus,
  HiEye,
  HiTrash,
  HiDownload,
} from 'react-icons/hi';
import { Link, useSearchParams } from 'react-router-dom';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import NoteModal from '../components/Notes/NoteModal';
import Pagination from '../components/UI/Pagination';
import { formatSalary, formatDate } from '../utils/formatUtils';
import api from '../utils/api';
import { APPLICATION_STATUSES, getStatusColor } from '../utils/statusConstants';

const STATUS_FILTER_OPTIONS = [{ value: '', label: 'All' }, ...APPLICATION_STATUSES];

const SavedJobs = () => {
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const { savedJobs, loading, error, savedPagination: pagination, statusFilter } = useSelector(
    (state) => state.jobs
  );
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  // Get current page from URL params or default to 1
  const currentPage = parseInt(searchParams.get('page') || '1');
  const pageSize = 20;

  useEffect(() => {
    if (isAuthenticated) {
      const params = { page: currentPage, limit: pageSize };
      if (statusFilter) params.status = statusFilter;
      dispatch(getSavedJobs(params));
    }
  }, [dispatch, isAuthenticated, currentPage, pageSize, statusFilter]);

  const handlePageChange = (newPage) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set('page', newPage.toString());
      return newParams;
    });
  };

  const handleUnsaveJob = (job) => {
    if (window.confirm('Are you sure you want to remove this bookmark?')) {
      dispatch(unsaveJob({ jobId: job.jobId, source: job.source || 'nyc' }));
    }
  };

  const handleAddNote = (job) => {
    setSelectedJob(job);
    setShowNoteModal(true);
  };

  const handleStatusChange = (job, newStatus) => {
    dispatch(updateJobStatus({ jobId: job.jobId, status: newStatus, source: job.source }));
  };

  const handleStatusFilterChange = (status) => {
    dispatch(setStatusFilter(status));
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set('page', '1');
      return newParams;
    });
  };

  const handleExportCsv = async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const response = await api.get(`/api/jobs/saved/export${params}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'saved-jobs.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  if (loading) {
    return (
      <div className='flex justify-center py-8'>
        <LoadingSpinner size='lg' />
      </div>
    );
  }

  if (error) {
    return (
      <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
        <p className='text-red-800'>{error}</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900'>Saved Jobs</h1>
            <p className='text-gray-600 mt-1'>
              {pagination?.total || savedJobs.length}{' '}
              {(pagination?.total || savedJobs.length) === 1 ? 'job' : 'jobs'}{' '}
              {statusFilter ? `with status "${statusFilter}"` : 'saved'}
            </p>
          </div>
          <div className='flex items-center space-x-2'>
            {savedJobs.length > 0 && (
              <button
                onClick={handleExportCsv}
                className='inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors'
                title='Export saved jobs to CSV'
              >
                <HiDownload className='h-4 w-4 mr-1.5' />
                Export CSV
              </button>
            )}
            <HiBookmarkAlt className='h-6 w-6 text-primary-600' />
          </div>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-4'>
        <div className='flex flex-wrap gap-2'>
          {STATUS_FILTER_OPTIONS.map((status) => (
            <button
              key={status.value}
              onClick={() => handleStatusFilterChange(status.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                statusFilter === status.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      {/* Saved Jobs List */}
      {savedJobs.length > 0 ? (
        <div className='space-y-4'>
          {savedJobs.map((job, index) => (
            <div
              key={job.jobId || job._id || `job-${index}`}
              className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'
            >
              <div className='flex justify-between items-start'>
                <div className='flex-1'>
                  <div className='flex items-center gap-3 mb-2'>
                    <h3 className='text-lg font-semibold text-gray-900'>
                      {job.businessTitle}
                    </h3>
                    {job.source === 'federal' ? (
                      <span className='px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800'>
                        Federal
                      </span>
                    ) : (
                      <span className='px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800'>
                        NYC
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                        job.applicationStatus
                      )}`}
                    >
                      {job.applicationStatus || 'interested'}
                    </span>
                  </div>
                  <p className='text-gray-600 mb-3'>
                    {job.civilServiceTitle}
                  </p>

                  <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600 mb-4'>
                    <div>
                      <span className='font-medium'>Category:</span>{' '}
                      {job.jobCategory || 'Not specified'}
                    </div>
                    <div>
                      <span className='font-medium'>Location:</span>{' '}
                      {job.workLocation || 'Not specified'}
                    </div>
                    <div>
                      <span className='font-medium'>Salary:</span>{' '}
                      {formatSalary(
                        job.salaryRangeFrom,
                        job.salaryRangeTo,
                        job.salaryFrequency
                      )}
                    </div>
                  </div>

                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600'>
                    <div>
                      <span className='font-medium'>Posted:</span>{' '}
                      {formatDate(job.postDate)}
                    </div>
                    <div>
                      <span className='font-medium'>Type:</span>{' '}
                      {job.fullTimePartTimeIndicator || 'Not specified'}
                    </div>
                  </div>

                  {job.jobDescription && (
                    <p className='mt-3 text-gray-700 line-clamp-2'>
                      {job.jobDescription.substring(0, 200)}...
                    </p>
                  )}
                </div>

                <div className='flex flex-col items-end space-y-2 ml-4'>
                  <div className='flex space-x-2'>
                    <button
                      onClick={() => handleAddNote(job)}
                      className='p-2 text-gray-400 hover:text-blue-600 transition-colors'
                      title='Add note for this job'
                    >
                      <HiPlus className='h-5 w-5' />
                    </button>
                    <Link
                      to={`/job/${job.jobId}?source=${job.source || 'nyc'}`}
                      className='p-2 text-gray-400 hover:text-primary-600 transition-colors'
                      title='View details'
                    >
                      <HiEye className='h-5 w-5' />
                    </Link>
                    <button
                      onClick={() => handleUnsaveJob(job)}
                      className='p-2 text-gray-400 hover:text-red-600 transition-colors'
                      title='Remove from saved'
                    >
                      <HiTrash className='h-5 w-5' />
                    </button>
                  </div>
                  <select
                    value={job.applicationStatus || 'interested'}
                    onChange={(e) => handleStatusChange(job, e.target.value)}
                    className='text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500'
                  >
                    {APPLICATION_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <div className='text-xs text-gray-500'>
                    Saved {formatDate(job.savedAt)}
                  </div>
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
      ) : (
        <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center'>
          <HiBookmarkAlt className='h-12 w-12 text-gray-400 mx-auto mb-4' />
          <h3 className='text-lg font-medium text-gray-900 mb-2'>
            {statusFilter ? 'No jobs with this status' : 'No saved jobs yet'}
          </h3>
          <p className='text-gray-600 mb-4'>
            {statusFilter
              ? 'Try a different status filter or save more jobs.'
              : "Start searching for jobs and save the ones you're interested in."}
          </p>
          {statusFilter ? (
            <button
              onClick={() => handleStatusFilterChange('')}
              className='btn btn-primary'
            >
              Show All Saved Jobs
            </button>
          ) : (
            <Link to='/search' className='btn btn-primary'>
              Search Jobs
            </Link>
          )}
        </div>
      )}

      {/* Note Modal */}
      <NoteModal
        isOpen={showNoteModal}
        onClose={() => {
          setShowNoteModal(false);
          setSelectedJob(null);
        }}
        jobId={selectedJob?.jobId}
        jobTitle={selectedJob?.businessTitle}
        source={selectedJob?.source}
      />

      {/* Pagination */}
      {savedJobs.length > 0 && pagination && (
        <Pagination
          currentPage={currentPage}
          totalPages={pagination.pages}
          total={pagination.total}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          label='saved jobs'
        />
      )}
    </div>
  );
};

export default SavedJobs;
