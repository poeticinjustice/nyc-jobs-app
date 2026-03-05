import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { getJobDetails, saveJob, unsaveJob, updateJobStatus, updateJobTracking, getJobNotes } from '../store/slices/jobsSlice';
import {
  HiBookmark,
  HiBookmarkAlt,
  HiLocationMarker,
  HiCalendar,
  HiCurrencyDollar,
  HiPlus,
  HiClock,
  HiShare,
  HiAnnotation,
  HiPaperClip,
  HiExternalLink,
  HiX,
} from 'react-icons/hi';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import SourceBadge from '../components/UI/SourceBadge';
import NoteModal from '../components/Notes/NoteModal';
import { renderHtmlContent } from '../utils/textUtils';
import { formatSalary, formatDate, getDeadlineInfo } from '../utils/formatUtils';
import { APPLICATION_STATUSES, getStatusColor } from '../utils/statusConstants';
import { validateDocUrl, DOC_LABEL_MAX } from '../utils/validation';

const JobDetails = () => {
  const { jobId } = useParams();
  const [searchParams] = useSearchParams();
  const source = searchParams.get('source') || 'nyc';
  const dispatch = useDispatch();
  const { currentJob, detailsLoading: loading, detailsError: error, jobNotes, jobNotesLoading } = useSelector((state) => state.jobs);
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [docLabel, setDocLabel] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docError, setDocError] = useState('');
  const navigate = useNavigate();

  const deadlineInfo = currentJob ? getDeadlineInfo(currentJob.postUntil) : null;

  const handleCopyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (jobId) {
      dispatch(getJobDetails({ jobId, source }));
    }
  }, [dispatch, jobId, source]);

  useEffect(() => {
    if (currentJob?.isSaved && currentJob?.jobId) {
      dispatch(getJobNotes({ jobId: currentJob.jobId }));
    }
  }, [dispatch, currentJob?.isSaved, currentJob?.jobId]);

  const effectiveSource = currentJob?.source || source;

  const handleTrackingDateChange = (field, value) => {
    dispatch(updateJobTracking({
      jobId: currentJob.jobId,
      source: effectiveSource,
      trackingData: { [field]: value || null },
    }));
  };

  const handleAddDocLink = () => {
    if (!docLabel.trim()) return;
    const urlErr = validateDocUrl(docUrl);
    if (urlErr) {
      setDocError(urlErr);
      return;
    }
    setDocError('');
    const updated = [...(currentJob.documentLinks || []), { label: docLabel.trim(), url: docUrl.trim() }];
    dispatch(updateJobTracking({
      jobId: currentJob.jobId,
      source: effectiveSource,
      trackingData: { documentLinks: updated },
    }));
    setDocLabel('');
    setDocUrl('');
  };

  const handleRemoveDocLink = (idx) => {
    const updated = (currentJob.documentLinks || []).filter((_, i) => i !== idx);
    dispatch(updateJobTracking({
      jobId: currentJob.jobId,
      source: effectiveSource,
      trackingData: { documentLinks: updated },
    }));
  };

  const handleStatusChange = (newStatus) => {
    if (!currentJob) return;
    dispatch(updateJobStatus({ jobId: currentJob.jobId, status: newStatus, source: effectiveSource }));
  };

  const handleSaveJob = async () => {
    if (!currentJob) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    try {
      if (currentJob.isSaved) {
        await dispatch(unsaveJob({ jobId: currentJob.jobId, source: effectiveSource })).unwrap();
      } else {
        await dispatch(saveJob({ jobId: currentJob.jobId, source: effectiveSource })).unwrap();
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

          <div className='flex items-center space-x-2'>
            <div className='relative'>
              <button
                onClick={handleCopyLink}
                className='p-3 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors'
                title='Copy link to this job'
              >
                <HiShare className='h-6 w-6' />
              </button>
              {copied && (
                <span className='absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap'>
                  Copied!
                </span>
              )}
            </div>
            {isAuthenticated && (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>

      {/* Deadline Banner */}
      {deadlineInfo && (
        <div className={`rounded-lg border p-4 flex items-center ${
          deadlineInfo.urgency === 'closed'
            ? 'bg-gray-50 border-gray-200'
            : deadlineInfo.urgency === 'urgent'
              ? 'bg-red-50 border-red-200'
              : 'bg-yellow-50 border-yellow-200'
        }`}>
          <HiCalendar className={`h-5 w-5 mr-3 flex-shrink-0 ${
            deadlineInfo.urgency === 'closed'
              ? 'text-gray-500'
              : deadlineInfo.urgency === 'urgent'
                ? 'text-red-500'
                : 'text-yellow-500'
          }`} />
          <div>
            <p className={`font-medium ${
              deadlineInfo.urgency === 'closed'
                ? 'text-gray-700'
                : deadlineInfo.urgency === 'urgent'
                  ? 'text-red-700'
                  : 'text-yellow-700'
            }`}>
              {deadlineInfo.isClosed
                ? 'This posting has closed.'
                : `Application deadline approaching: ${deadlineInfo.label.toLowerCase()}`}
            </p>
            <p className={`text-sm ${
              deadlineInfo.urgency === 'closed' ? 'text-gray-500' : deadlineInfo.urgency === 'urgent' ? 'text-red-500' : 'text-yellow-500'
            }`}>
              Deadline: {formatDate(currentJob.postUntil)}
            </p>
          </div>
        </div>
      )}

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
                  : `https://cityjobs.nyc.gov/job/${currentJob.jobId}`
              }
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors'
            >
              {effectiveSource === 'federal'
                ? 'Apply at USAJobs'
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
                  {deadlineInfo && (
                    <span className={`ml-2 text-sm font-medium ${
                      deadlineInfo.urgency === 'closed'
                        ? 'text-gray-500'
                        : deadlineInfo.urgency === 'urgent'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                    }`}>
                      ({deadlineInfo.label})
                    </span>
                  )}
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

          {/* Tracking Dates */}
          {currentJob.isSaved && (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
                <HiCalendar className='h-5 w-5 mr-2 text-gray-500' />
                Tracking Dates
              </h3>
              <div className='space-y-3'>
                <div>
                  <label className='text-sm font-medium text-gray-500'>Application Date</label>
                  <input
                    type='date'
                    value={currentJob.applicationDate ? new Date(currentJob.applicationDate).toISOString().split('T')[0] : ''}
                    onChange={(e) => handleTrackingDateChange('applicationDate', e.target.value)}
                    className='mt-1 block w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500'
                  />
                </div>
                <div>
                  <label className='text-sm font-medium text-gray-500'>Interview Date</label>
                  <input
                    type='date'
                    value={currentJob.interviewDate ? new Date(currentJob.interviewDate).toISOString().split('T')[0] : ''}
                    onChange={(e) => handleTrackingDateChange('interviewDate', e.target.value)}
                    className='mt-1 block w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500'
                  />
                </div>
                <div>
                  <label className='text-sm font-medium text-gray-500'>Follow-up Date</label>
                  <input
                    type='date'
                    value={currentJob.followUpDate ? new Date(currentJob.followUpDate).toISOString().split('T')[0] : ''}
                    onChange={(e) => handleTrackingDateChange('followUpDate', e.target.value)}
                    className='mt-1 block w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500'
                  />
                </div>
              </div>
            </div>
          )}

          {/* Document Links */}
          {currentJob.isSaved && (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h3 className='text-lg font-semibold text-gray-900 mb-4 flex items-center'>
                <HiPaperClip className='h-5 w-5 mr-2 text-gray-500' />
                Documents
              </h3>
              {currentJob.documentLinks?.length > 0 && (
                <div className='space-y-2 mb-4'>
                  {currentJob.documentLinks.map((link, idx) => (
                    <div key={idx} className='flex items-center justify-between text-sm'>
                      <a
                        href={link.url}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='text-primary-600 hover:underline truncate flex items-center'
                      >
                        <HiExternalLink className='h-3.5 w-3.5 mr-1 flex-shrink-0' />
                        {link.label}
                      </a>
                      <button
                        onClick={() => handleRemoveDocLink(idx)}
                        className='text-gray-400 hover:text-red-500 ml-2 flex-shrink-0'
                        title='Remove link'
                      >
                        <HiX className='h-4 w-4' />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {(!currentJob.documentLinks || currentJob.documentLinks.length < 5) && (
                <div className='space-y-2'>
                  <input
                    type='text'
                    value={docLabel}
                    onChange={(e) => setDocLabel(e.target.value)}
                    placeholder='Label (e.g. Resume)'
                    maxLength={DOC_LABEL_MAX}
                    className='block w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500'
                  />
                  <input
                    type='url'
                    value={docUrl}
                    onChange={(e) => { setDocUrl(e.target.value); if (docError) setDocError(''); }}
                    placeholder='https://...'
                    className={`block w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary-500 ${docError ? 'border-red-300' : 'border-gray-300'}`}
                  />
                  {docError && <p className='text-xs text-red-600'>{docError}</p>}
                  <button
                    onClick={handleAddDocLink}
                    className='text-sm text-primary-600 hover:text-primary-700 font-medium'
                  >
                    + Add Link
                  </button>
                </div>
              )}
              {!currentJob.documentLinks?.length && !docLabel && (
                <p className='text-sm text-gray-500'>Add links to resumes, cover letters, or other documents.</p>
              )}
            </div>
          )}

          {/* Job Notes */}
          {currentJob.isSaved && (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <div className='flex items-center justify-between mb-4'>
                <h3 className='text-lg font-semibold text-gray-900 flex items-center'>
                  <HiAnnotation className='h-5 w-5 mr-2 text-gray-500' />
                  Notes {currentJob.noteCount > 0 && `(${currentJob.noteCount})`}
                </h3>
                <button
                  onClick={() => setShowNoteModal(true)}
                  className='text-primary-600 hover:text-primary-700 text-sm font-medium'
                >
                  + Add Note
                </button>
              </div>
              {jobNotesLoading ? (
                <LoadingSpinner size='sm' />
              ) : jobNotes.length > 0 ? (
                <div className='space-y-3'>
                  {jobNotes.slice(0, 5).map((note) => (
                    <div key={note._id} className='p-3 bg-gray-50 rounded-lg'>
                      <p className='text-sm font-medium text-gray-900'>{note.title}</p>
                      <p className='text-xs text-gray-500 mt-1'>
                        {note.content.length > 100 ? note.content.substring(0, 100) + '...' : note.content}
                      </p>
                      <p className='text-xs text-gray-400 mt-1'>{formatDate(note.createdAt)}</p>
                    </div>
                  ))}
                  {jobNotes.length > 5 && (
                    <Link
                      to={`/notes?jobId=${currentJob.jobId}`}
                      className='text-sm text-primary-600 hover:underline block'
                    >
                      View all {currentJob.noteCount} notes
                    </Link>
                  )}
                </div>
              ) : (
                <p className='text-sm text-gray-500'>No notes yet. Add one to track your progress.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Note Modal */}
      <NoteModal
        isOpen={showNoteModal}
        onClose={() => {
          setShowNoteModal(false);
          if (currentJob?.jobId) {
            dispatch(getJobNotes({ jobId: currentJob.jobId }));
          }
        }}
        jobId={currentJob?.jobId}
        jobTitle={currentJob?.businessTitle}
        source={effectiveSource}
      />
    </div>
  );
};

export default JobDetails;
