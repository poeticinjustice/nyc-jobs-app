import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  getSavedJobs,
  unsaveJob,
  updateJobStatus,
  bulkUpdateJobStatus,
  setStatusFilter,
} from '../store/slices/jobsSlice';
import {
  HiBookmarkAlt,
  HiPlus,
  HiEye,
  HiTrash,
  HiDownload,
  HiAnnotation,
  HiPaperClip,
  HiSwitchHorizontal,
} from 'react-icons/hi';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import SourceBadge from '../components/UI/SourceBadge';
import NoteModal from '../components/Notes/NoteModal';
import JobComparison from '../components/Jobs/JobComparison';
import SavedSearchAlerts from '../components/Search/SavedSearchAlerts';
import Pagination from '../components/UI/Pagination';
import DeadlineBadge from '../components/UI/DeadlineBadge';
import { formatSalary, formatDate } from '../utils/formatUtils';
import { truncateText } from '../utils/textUtils';
import { downloadFile } from '../utils/downloadFile';
import { APPLICATION_STATUSES, getStatusColor } from '../utils/statusConstants';

const STATUS_FILTER_OPTIONS = [{ value: '', label: 'All' }, ...APPLICATION_STATUSES];
const PAGE_SIZE = 20;
const COMPARE_MIN = 2;
const COMPARE_MAX = 4;

const jobKey = (job) => `${job.source || 'nyc'}-${job.jobId}`;

const SavedJobs = () => {
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const { savedJobs, savedJobsLoading: loading, savedJobsError: error, saveError, savedPagination: pagination, statusFilter } = useSelector(
    (state) => state.jobs
  );
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [bulkStatus, setBulkStatus] = useState(APPLICATION_STATUSES[0].value);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // Get current page from URL params or default to 1
  const currentPage = parseInt(searchParams.get('page') || '1');

  // Sync status filter from URL (e.g. /saved?status=applied from Home) so
  // Redux state (used for tab highlighting) tracks the URL
  const urlStatus = searchParams.get('status') || '';
  useEffect(() => {
    if (urlStatus !== statusFilter) {
      dispatch(setStatusFilter(urlStatus));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, urlStatus]);

  // Fetch straight from the URL params — avoids a double fetch on mount while
  // the Redux statusFilter is still stale
  const fetchSavedJobs = useCallback(() => {
    const params = { page: currentPage, limit: PAGE_SIZE };
    if (urlStatus) params.status = urlStatus;
    return dispatch(getSavedJobs(params));
  }, [dispatch, currentPage, urlStatus]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSavedJobs();
    }
  }, [isAuthenticated, fetchSavedJobs]);

  // Selection is per page — reset it whenever the page or status filter changes
  useEffect(() => {
    setSelectedKeys([]);
    setShowComparison(false);
  }, [currentPage, urlStatus]);

  // Only keys still present on the page count as selected, so an unsaved job
  // can never linger in the selection
  const selectedJobs = useMemo(
    () => savedJobs.filter((job) => selectedKeys.includes(jobKey(job))),
    [savedJobs, selectedKeys]
  );
  const allOnPageSelected =
    savedJobs.length > 0 && selectedJobs.length === savedJobs.length;
  const canCompare =
    selectedJobs.length >= COMPARE_MIN && selectedJobs.length <= COMPARE_MAX;

  const toggleJobSelected = (job) => {
    const key = jobKey(job);
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSelectAllOnPage = () => {
    setSelectedKeys(savedJobs.map(jobKey));
  };

  const handleClearSelection = () => {
    setSelectedKeys([]);
  };

  const handleBulkStatusApply = async () => {
    if (selectedJobs.length === 0 || bulkSubmitting) return;
    setBulkSubmitting(true);
    try {
      const result = await dispatch(
        bulkUpdateJobStatus({
          jobs: selectedJobs.map((job) => ({
            jobId: job.jobId,
            source: job.source || 'nyc',
          })),
          status: bulkStatus,
        })
      ).unwrap();
      const count = result?.updated ?? selectedJobs.length;
      toast.success(`Updated ${count} ${count === 1 ? 'job' : 'jobs'}`);
      setSelectedKeys([]);
      // Refresh so a status-filtered list drops the jobs that moved out of it
      fetchSavedJobs();
    } catch (err) {
      toast.error(err?.message || err || 'Failed to update statuses');
    }
    setBulkSubmitting(false);
  };

  const handlePageChange = (newPage) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set('page', newPage.toString());
      return newParams;
    });
    window.scrollTo(0, 0);
  };

  const handleUnsaveJob = async (job) => {
    if (window.confirm('Are you sure you want to remove this bookmark?')) {
      try {
        await dispatch(unsaveJob({ jobId: job.jobId, source: job.source || 'nyc' })).unwrap();
        // If that emptied the current page, step back to the previous one
        if (savedJobs.length === 1 && currentPage > 1) {
          handlePageChange(currentPage - 1);
        }
      } catch (err) {
        toast.error(err?.message || err || 'Failed to remove saved job');
      }
    }
  };

  const handleAddNote = (job) => {
    setSelectedJob(job);
    setShowNoteModal(true);
  };

  const handleStatusChange = async (job, newStatus) => {
    try {
      await dispatch(updateJobStatus({ jobId: job.jobId, status: newStatus, source: job.source || 'nyc' })).unwrap();
    } catch (err) {
      toast.error(err?.message || err || 'Failed to update status');
    }
  };

  const handleStatusFilterChange = (status) => {
    dispatch(setStatusFilter(status));
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set('page', '1');
      if (status) {
        newParams.set('status', status);
      } else {
        newParams.delete('status');
      }
      return newParams;
    });
  };

  const handleExportCsv = async () => {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      await downloadFile(`/api/jobs/saved/export${params}`, 'saved-jobs.csv');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to export CSV');
    }
  };

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

      {/* Saved Search Alerts */}
      <SavedSearchAlerts />

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

      {/* Bulk Selection Toolbar */}
      {!loading && savedJobs.length > 0 && (
        <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-4'>
          <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3'>
            <div className='flex items-center gap-3'>
              <button
                type='button'
                onClick={handleSelectAllOnPage}
                disabled={allOnPageSelected}
                className='text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:hover:text-primary-600'
              >
                Select all on page
              </button>
              {selectedJobs.length > 0 && (
                <>
                  <button
                    type='button'
                    onClick={handleClearSelection}
                    className='text-sm font-medium text-gray-500 hover:text-gray-700'
                  >
                    Clear selection
                  </button>
                  <span className='text-sm text-gray-500'>
                    {selectedJobs.length} selected
                  </span>
                </>
              )}
            </div>

            {selectedJobs.length > 0 && (
              <div className='flex flex-wrap items-center gap-2'>
                <label htmlFor='bulk-status' className='text-sm text-gray-600'>
                  Set status to
                </label>
                <select
                  id='bulk-status'
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  className='text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500'
                >
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type='button'
                  onClick={handleBulkStatusApply}
                  disabled={bulkSubmitting}
                  className='inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors'
                >
                  {bulkSubmitting ? 'Applying...' : 'Apply'}
                </button>
                <button
                  type='button'
                  onClick={() => setShowComparison(true)}
                  disabled={!canCompare}
                  title={
                    canCompare
                      ? 'Compare the selected jobs'
                      : `Select ${COMPARE_MIN}-${COMPARE_MAX} jobs to compare`
                  }
                  className='inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white transition-colors'
                >
                  <HiSwitchHorizontal className='h-4 w-4 mr-1.5' />
                  Compare ({selectedJobs.length})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {(error || saveError) && (
        <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
          <p className='text-red-800'>{error || saveError}</p>
        </div>
      )}

      {/* Saved Jobs List */}
      {loading ? (
        <div className='flex justify-center py-8'>
          <LoadingSpinner size='lg' />
        </div>
      ) : savedJobs.length > 0 ? (
        <div className='space-y-4'>
          {savedJobs.map((job) => (
            <div
              key={`${job.source}-${job.jobId}`}
              className={`bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow ${
                selectedKeys.includes(jobKey(job))
                  ? 'border-primary-400 ring-1 ring-primary-200'
                  : 'border-gray-200'
              }`}
            >
              <div className='flex justify-between items-start'>
                <input
                  type='checkbox'
                  checked={selectedKeys.includes(jobKey(job))}
                  onChange={() => toggleJobSelected(job)}
                  aria-label={`Select ${job.businessTitle}`}
                  className='mt-1.5 mr-4 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500'
                />
                <div className='flex-1'>
                  <div className='flex items-center gap-3 mb-2'>
                    <h3 className='text-lg font-semibold text-gray-900'>
                      {job.businessTitle}
                    </h3>
                    <SourceBadge source={job.source} />
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                        job.applicationStatus
                      )}`}
                    >
                      {job.applicationStatus || 'interested'}
                    </span>
                    <DeadlineBadge postUntil={job.postUntil} />
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

                  {(job.applicationDate || job.interviewDate || job.followUpDate) && (
                    <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600 mt-2'>
                      {job.applicationDate && (
                        <div>
                          <span className='font-medium'>Applied:</span>{' '}
                          {formatDate(job.applicationDate)}
                        </div>
                      )}
                      {job.interviewDate && (
                        <div>
                          <span className='font-medium'>Interview:</span>{' '}
                          {formatDate(job.interviewDate)}
                        </div>
                      )}
                      {job.followUpDate && (
                        <div>
                          <span className='font-medium'>Follow-up:</span>{' '}
                          {formatDate(job.followUpDate)}
                        </div>
                      )}
                    </div>
                  )}

                  {(job.noteCount > 0 || job.documentLinks?.length > 0) && (
                    <div className='flex items-center gap-4 text-xs text-gray-500 mt-2'>
                      {job.noteCount > 0 && (
                        <span className='flex items-center'>
                          <HiAnnotation className='h-3.5 w-3.5 mr-1' />
                          {job.noteCount} {job.noteCount === 1 ? 'note' : 'notes'}
                        </span>
                      )}
                      {job.documentLinks?.length > 0 && (
                        <span className='flex items-center'>
                          <HiPaperClip className='h-3.5 w-3.5 mr-1' />
                          {job.documentLinks.length} {job.documentLinks.length === 1 ? 'doc' : 'docs'}
                        </span>
                      )}
                    </div>
                  )}

                  {job.jobDescription && (
                    <p className='mt-3 text-gray-700 line-clamp-2'>
                      {truncateText(job.jobDescription)}
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

      {/* Job Comparison Modal */}
      <JobComparison
        isOpen={showComparison && canCompare}
        onClose={() => setShowComparison(false)}
        jobs={selectedJobs}
      />

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
          pageSize={PAGE_SIZE}
          onPageChange={handlePageChange}
          label='saved jobs'
        />
      )}
    </div>
  );
};

export default SavedJobs;
