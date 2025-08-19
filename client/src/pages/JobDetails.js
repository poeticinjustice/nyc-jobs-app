import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { getJobDetails, saveJob, unsaveJob } from '../store/slices/jobsSlice';
import {
  HiBookmark,
  HiBookmarkAlt,
  HiLocationMarker,
  HiCalendar,
  HiCurrencyDollar,
  HiPlus,
} from 'react-icons/hi';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import NoteModal from '../components/Notes/NoteModal';
import { cleanText } from '../utils/textUtils';

const JobDetails = () => {
  const { jobId } = useParams();
  const dispatch = useDispatch();
  const { currentJob, loading, error } = useSelector((state) => state.jobs);
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [showNoteModal, setShowNoteModal] = useState(false);

  useEffect(() => {
    if (jobId) {
      dispatch(getJobDetails(jobId));
    }
  }, [dispatch, jobId]);

  const handleSaveToggle = () => {
    if (currentJob?.isSaved) {
      dispatch(unsaveJob(currentJob.jobId));
    } else {
      dispatch(saveJob(currentJob.jobId));
    }
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
            <h1 className='text-3xl font-bold text-gray-900 mb-2'>
              {cleanText(currentJob.businessTitle)}
            </h1>
            <p className='text-lg text-gray-600 mb-4'>
              {cleanText(currentJob.civilServiceTitle)}
            </p>

            <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-6'>
              <div className='flex items-center text-gray-600'>
                <HiLocationMarker className='h-5 w-5 mr-2' />
                <span>
                  {cleanText(currentJob.workLocation) ||
                    'Location not specified'}
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
            <div className='flex space-x-2'>
              <button
                onClick={() => setShowNoteModal(true)}
                className='p-3 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors'
                title='Add note for this job'
              >
                <HiPlus className='h-6 w-6' />
              </button>
              <button
                onClick={handleSaveToggle}
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
                <div className='whitespace-pre-wrap text-gray-700'>
                  {currentJob.jobDescription}
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
                <div className='whitespace-pre-wrap text-gray-700'>
                  {currentJob.minimumQualRequirements}
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
                <div className='whitespace-pre-wrap text-gray-700'>
                  {currentJob.preferredSkills}
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
                <div className='whitespace-pre-wrap text-gray-700'>
                  {currentJob.additionalInformation}
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
                  {cleanText(currentJob.jobCategory) || 'Not specified'}
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
                  {cleanText(currentJob.fullTimePartTimeIndicator) ||
                    'Not specified'}
                </p>
              </div>
              <div>
                <span className='text-sm font-medium text-gray-500'>
                  Division
                </span>
                <p className='text-gray-900'>
                  {cleanText(currentJob.divisionWorkUnit) || 'Not specified'}
                </p>
              </div>
              <div>
                <span className='text-sm font-medium text-gray-500'>
                  Hours/Shift
                </span>
                <p className='text-gray-900'>
                  {cleanText(currentJob.hoursShift) || 'Not specified'}
                </p>
              </div>
            </div>
          </div>

          {/* Application Info */}
          <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
            <h3 className='text-lg font-semibold text-gray-900 mb-4'>
              How to Apply
            </h3>
            {currentJob.toApply ? (
              <div className='prose max-w-none'>
                <div className='whitespace-pre-wrap text-gray-700'>
                  {cleanText(currentJob.toApply)}
                </div>
              </div>
            ) : (
              <p className='text-gray-500'>
                Application instructions not available.
              </p>
            )}
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
        </div>
      </div>

      {/* Note Modal */}
      <NoteModal
        isOpen={showNoteModal}
        onClose={() => setShowNoteModal(false)}
        jobId={currentJob?.jobId}
        jobTitle={currentJob?.businessTitle}
      />
    </div>
  );
};

export default JobDetails;
