import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { getJobDetails, saveJob, unsaveJob, updateJobStatus } from '../store/slices/jobsSlice';
import {
  HiBookmark,
  HiBookmarkAlt,
  HiLocationMarker,
  HiCalendar,
  HiCurrencyDollar,
  HiPlus,
  HiClock,
} from 'react-icons/hi';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import SourceBadge from '../components/UI/SourceBadge';
import NoteModal from '../components/Notes/NoteModal';
import { renderHtmlContent } from '../utils/textUtils';
import { formatSalary, formatDate } from '../utils/formatUtils';
import { APPLICATION_STATUSES, getStatusColor } from '../utils/statusConstants';

const JobDetails = () => {
  const { jobId } = useParams();
  const [searchParams] = useSearchParams();
  const source = searchParams.get('source') || 'nyc';
  const dispatch = useDispatch();
  const { currentJob, loading, error } = useSelector((state) => state.jobs);
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (jobId) {
      dispatch(getJobDetails({ jobId, source }));
    }
  }, [dispatch, jobId, source]);

  const effectiveSource = currentJob?.source || source;

  const handleStatusChange = (newStatus) => {
    dispatch(updateJobStatus({ jobId: currentJob.jobId, status: newStatus, source: effectiveSource }));
  };

  const handleSaveJob = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    try {
      if (currentJob.isSaved) {
        await dispatch(unsaveJob({ jobId: currentJob.jobId, source: effectiveSource })).unwrap();
      } else {
        const payload = { jobId: currentJob.jobId, source: effectiveSource };
        if (effectiveSource === 'adzuna') payload.jobData = currentJob;
        await dispatch(saveJob(payload)).unwrap();
      }
    } catch (error) {
      console.error('Error saving/unsaving job:', error);
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

  if (!currentJob) {
    return (
      <div className='text-center py-8'>
        <p className='text-gray-500'>Job not found.</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Job Header */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <div className='flex justify-between items-start'>
          <div className='flex-1'>
            <div className='flex items-center gap-3 mb-2'>
              <h1 className='text-3xl font-bold text-gray-900'>
                {currentJob.businessTitle}
              </h1>
              <SourceBadge source={effectiveSource} />
              {currentJob.isSaved && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                    currentJob.applicationStatus
                  )}`}
                >
                  {currentJob.applicationStatus || 'interested'}
                </span>
              )}
            </div>
            <p className='text-lg text-gray-600 mb-4'>
              {currentJob.civilServiceTitle}
            </p>

            <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-6'>
              <div className='flex items-center text-gray-600'>
                <HiLocationMarker className='h-5 w-5 mr-2' />
                <span>
                  {currentJob.workLocation || 'Location not specified'}
                </span>
              </div>
              <div className='flex items-center text-gray-600'>
                <HiCalendar className='h-5 w-5 mr-2' />
                <span>Posted: {formatDate(currentJob.postDate)}</span>
              </div>
              <div className='flex items-center text-gray-600'>
                <HiCurrencyDollar className='h-5 w-5 mr-2' />
                <span>
                  {formatSalary(
                    currentJob.salaryRangeFrom,
                    currentJob.salaryRangeTo,
                    currentJob.salaryFrequency
                  )}
                </span>
              </div>
            </div>
          </div>

          {isAuthenticated && (
            <div className='flex items-center space-x-2'>
              {currentJob.isSaved && (
                <select
                  value={currentJob.applicationStatus || 'interested'}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className='text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'
                >
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setShowNoteModal(true)}
                className='p-3 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors'
                title='Add note for this job'
              >
                <HiPlus className='h-6 w-6' />
              </button>
              <button
                onClick={handleSaveJob}
                className={`p-3 rounded-lg border transition-colors ${
                  currentJob.isSaved
                    ? 'bg-primary-50 border-primary-200 text-primary-700'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {currentJob.isSaved ? (
                  <HiBookmarkAlt className='h-6 w-6' />
                ) : (
                  <HiBookmark className='h-6 w-6' />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Job Details */}
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        {/* Main Content */}
        <div className='lg:col-span-2 space-y-6'>
          {/* Job Description */}
          <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
            <h2 className='text-xl font-semibold text-gray-900 mb-4'>
              Job Description
            </h2>
            <div className='prose max-w-none'>
              {currentJob.jobDescription ? (
                <div className='text-gray-700'>
                  {renderHtmlContent(currentJob.jobDescription)}
                </div>
              ) : (
                <p className='text-gray-500'>No description available.</p>
              )}
            </div>
          </div>

          {/* Minimum Qualifications */}
          {currentJob.minimumQualRequirements && (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h2 className='text-xl font-semibold text-gray-900 mb-4'>
                Minimum Qualifications
              </h2>
              <div className='prose max-w-none'>
                <div className='text-gray-700'>
                  {renderHtmlContent(currentJob.minimumQualRequirements)}
                </div>
              </div>
            </div>
          )}

          {/* Preferred Skills */}
          {currentJob.preferredSkills && (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h2 className='text-xl font-semibold text-gray-900 mb-4'>
                Preferred Skills
              </h2>
              <div className='prose max-w-none'>
                <div className='text-gray-700'>
                  {renderHtmlContent(currentJob.preferredSkills)}
                </div>
              </div>
            </div>
          )}

          {/* Additional Information */}
          {currentJob.additionalInformation && (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h2 className='text-xl font-semibold text-gray-900 mb-4'>
                Additional Information
              </h2>
              <div className='prose max-w-none'>
                <div className='text-gray-700'>
                  {renderHtmlContent(currentJob.additionalInformation)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className='space-y-6'>
          {/* Job Info Card */}
          <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
            <h3 className='text-lg font-semibold text-gray-900 mb-4'>
              Job Information
            </h3>
            <div className='space-y-3'>
              <div>
                <span className='text-sm font-medium text-gray-500'>
                  Category
                </span>
                <p className='text-gray-900'>
                  {currentJob.jobCategory || 'Not specified'}
                </p>
              </div>
              <div>
                <span className='text-sm font-medium text-gray-500'>Level</span>
                <p className='text-gray-900'>
                  {currentJob.level || 'Not specified'}
                </p>
              </div>
              <div>
                <span className='text-sm font-medium text-gray-500'>Type</span>
                <p className='text-gray-900'>
                  {currentJob.fullTimePartTimeIndicator || 'Not specified'}
                </p>
              </div>
              <div>
                <span className='text-sm font-medium text-gray-500'>
                  Division
                </span>
                <p className='text-gray-900'>
                  {currentJob.divisionWorkUnit || 'Not specified'}
                </p>
              </div>
              <div>
                <span className='text-sm font-medium text-gray-500'>
                  Hours/Shift
                </span>
                <p className='text-gray-900'>
                  {currentJob.hoursShift || 'Not specified'}
                </p>
              </div>
            </div>
          </div>

          {/* Application Info */}
          <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
            <h3 className='text-lg font-semibold text-gray-900 mb-4'>
              How to Apply
            </h3>
            <a
              href={
                effectiveSource === 'federal'
                  ? currentJob.externalUrl || `https://www.usajobs.gov/job/${currentJob.jobId}`
                  : effectiveSource === 'adzuna'
                    ? currentJob.externalUrl || currentJob.toApply || '#'
                    : `https://cityjobs.nyc.gov/job/${currentJob.jobId}`
              }
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors'
            >
              {effectiveSource === 'federal'
                ? 'Apply at USAJobs'
                : effectiveSource === 'adzuna'
                  ? 'Apply Now'
                  : 'Apply at NYC Jobs'}
              <svg
                className='ml-2 h-4 w-4'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'
                />
              </svg>
            </a>
          </div>

          {/* Important Dates */}
          <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
            <h3 className='text-lg font-semibold text-gray-900 mb-4'>
              Important Dates
            </h3>
            <div className='space-y-3'>
              <div>
                <span className='text-sm font-medium text-gray-500'>
                  Posted Date
                </span>
                <p className='text-gray-900'>
                  {formatDate(currentJob.postDate)}
                </p>
              </div>
              <div>
                <span className='text-sm font-medium text-gray-500'>
                  Post Until
                </span>
                <p className='text-gray-900'>
                  {formatDate(currentJob.postUntil)}
                </p>
              </div>
              <div>
                <span className='text-sm font-medium text-gray-500'>
                  Process Date
                </span>
                <p className='text-gray-900'>
                  {formatDate(currentJob.processDate)}
                </p>
              </div>
            </div>
          </div>

          {/* Application Timeline */}
          {currentJob.isSaved && currentJob.statusHistory?.length > 0 && (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
                <HiClock className='h-5 w-5 mr-2 text-gray-500' />
                Application Timeline
              </h3>
              <div className='relative'>
                {/* Vertical line */}
                <div className='absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200' />
                <div className='space-y-4'>
                  {[...currentJob.statusHistory]
                    .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
                    .map((entry, index) => {
                      const statusInfo = APPLICATION_STATUSES.find(
                        (s) => s.value === entry.status
                      );
                      return (
                        <div key={index} className='relative flex items-start pl-8'>
                          <div
                            className={`absolute left-1.5 top-1 w-3 h-3 rounded-full border-2 border-white ${
                              index === 0 ? 'bg-primary-500' : 'bg-gray-300'
                            }`}
                          />
                          <div className='flex-1'>
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                                statusInfo?.color || 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {statusInfo?.label || entry.status}
                            </span>
                            <p className='text-xs text-gray-500 mt-1'>
                              {formatDate(entry.changedAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Note Modal */}
      <NoteModal
        isOpen={showNoteModal}
        onClose={() => setShowNoteModal(false)}
        jobId={currentJob?.jobId}
        jobTitle={currentJob?.businessTitle}
        source={effectiveSource}
      />
    </div>
  );
};

export default JobDetails;
