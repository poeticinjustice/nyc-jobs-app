import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getSavedJobs, unsaveJob } from '../store/slices/jobsSlice';
import { HiBookmarkAlt, HiTrash, HiEye, HiPlus } from 'react-icons/hi';
import { Link, useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import NoteModal from '../components/Notes/NoteModal';
import { cleanText } from '../utils/textUtils';

const SavedJobs = () => {
  const dispatch = useDispatch();
  const { savedJobs, loading, error } = useSelector((state) => state.jobs);
  const { isAuthenticated } = useSelector((state) => state.auth);
  const navigate = useNavigate();
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      dispatch(getSavedJobs());
    }
  }, [dispatch, isAuthenticated]);

  const handleUnsaveJob = (jobId) => {
    dispatch(unsaveJob(jobId));
  };

  const handleAddNote = (job) => {
    setSelectedJob(job);
    setShowNoteModal(true);
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

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <div className='flex justify-between items-center'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900'>Saved Jobs</h1>
            <p className='text-gray-600 mt-1'>
              {savedJobs.length} {savedJobs.length === 1 ? 'job' : 'jobs'} saved
            </p>
          </div>
          <div className='flex items-center space-x-2'>
            <HiBookmarkAlt className='h-6 w-6 text-primary-600' />
          </div>
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
                  <h3 className='text-lg font-semibold text-gray-900 mb-2'>
                    {cleanText(job.businessTitle)}
                  </h3>
                  <p className='text-gray-600 mb-3'>
                    {cleanText(job.civilServiceTitle)}
                  </p>

                  <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600 mb-4'>
                    <div>
                      <span className='font-medium'>Category:</span>{' '}
                      {cleanText(job.jobCategory) || 'Not specified'}
                    </div>
                    <div>
                      <span className='font-medium'>Location:</span>{' '}
                      {cleanText(job.workLocation) || 'Not specified'}
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
                      {cleanText(job.fullTimePartTimeIndicator) ||
                        'Not specified'}
                    </div>
                  </div>

                  {job.jobDescription && (
                    <p className='mt-3 text-gray-700 line-clamp-2'>
                      {cleanText(job.jobDescription).substring(0, 200)}...
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
                      to={`/job/${job.jobId}`}
                      className='p-2 text-gray-400 hover:text-primary-600 transition-colors'
                      title='View details'
                    >
                      <HiEye className='h-5 w-5' />
                    </Link>
                    <button
                      onClick={() => handleUnsaveJob(job.jobId)}
                      className='p-2 text-gray-400 hover:text-red-600 transition-colors'
                      title='Remove from saved'
                    >
                      <HiTrash className='h-5 w-5' />
                    </button>
                  </div>
                  <div className='text-xs text-gray-500'>
                    Saved {formatDate(job.savedBy?.[0]?.savedAt)}
                  </div>
                </div>
              </div>

              <div className='mt-4 pt-4 border-t border-gray-200'>
                <Link
                  to={`/job/${job.jobId}`}
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
            No saved jobs yet
          </h3>
          <p className='text-gray-600 mb-4'>
            Start searching for jobs and save the ones you're interested in.
          </p>
          <Link to='/search' className='btn btn-primary'>
            Search Jobs
          </Link>
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
      />
    </div>
  );
};

export default SavedJobs;
