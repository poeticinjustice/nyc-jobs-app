import React, { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { HiX, HiExternalLink } from 'react-icons/hi';
import SourceBadge from '../UI/SourceBadge';
import DeadlineBadge from '../UI/DeadlineBadge';
import { formatSalary, formatDate } from '../../utils/formatUtils';
import { getStatusColor } from '../../utils/statusConstants';

// Rough annualization so salaries quoted at different frequencies can be
// ranked against each other. Only used to pick the "best" column.
const FREQUENCY_MULTIPLIERS = {
  hourly: 2080,
  hour: 2080,
  daily: 261,
  day: 261,
  weekly: 52,
  week: 52,
  biweekly: 26,
  monthly: 12,
  month: 12,
  annual: 1,
  annually: 1,
  annum: 1,
  yearly: 1,
  year: 1,
};

const annualizedSalary = (job) => {
  const top = Number(job.salaryRangeTo) || Number(job.salaryRangeFrom) || 0;
  if (!top || isNaN(top)) return 0;
  const frequency = (job.salaryFrequency || '').trim().toLowerCase();
  return top * (FREQUENCY_MULTIPLIERS[frequency] ?? 1);
};

const jobKey = (job) => `${job.source || 'nyc'}-${job.jobId}`;

const JobComparison = ({ isOpen, onClose, jobs = [] }) => {
  const modalRef = useRef(null);
  const firstFocusRef = useRef(null);

  // Focus trap and Escape key
  useEffect(() => {
    if (!isOpen) return;

    // Focus the first focusable element
    const timer = setTimeout(() => {
      firstFocusRef.current?.focus();
    }, 0);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Trap focus within modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Keys of the job(s) with the highest annualized salary — ties all highlight
  const bestSalaryKeys = useMemo(() => {
    const best = Math.max(0, ...jobs.map(annualizedSalary));
    if (!best) return new Set();
    return new Set(jobs.filter((j) => annualizedSalary(j) === best).map(jobKey));
  }, [jobs]);

  const rows = useMemo(
    () => [
      {
        label: 'Source',
        render: (job) => <SourceBadge source={job.source} />,
      },
      {
        label: 'Agency',
        render: (job) => job.agency || 'Not specified',
      },
      {
        label: 'Location',
        render: (job) => job.workLocation || 'Not specified',
      },
      {
        label: 'Salary',
        highlight: (job) => bestSalaryKeys.has(jobKey(job)),
        render: (job) => (
          <span>
            {formatSalary(job.salaryRangeFrom, job.salaryRangeTo, job.salaryFrequency)}
            {bestSalaryKeys.has(jobKey(job)) && (
              <span className='ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800'>
                Best
              </span>
            )}
          </span>
        ),
      },
      {
        label: 'Type',
        render: (job) => job.fullTimePartTimeIndicator || 'Not specified',
      },
      {
        label: 'Category',
        render: (job) => job.jobCategory || 'Not specified',
      },
      {
        label: 'Posted',
        render: (job) => formatDate(job.postDate),
      },
      {
        label: 'Closes',
        render: (job) => (
          <span>
            {job.postUntil ? formatDate(job.postUntil) : 'No deadline listed'}
            <DeadlineBadge postUntil={job.postUntil} className='ml-2' />
          </span>
        ),
      },
      {
        label: 'Status',
        render: (job) => (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(
              job.applicationStatus
            )}`}
          >
            {job.applicationStatus || 'interested'}
          </span>
        ),
      },
      {
        label: 'Links',
        render: (job) => (
          <div className='flex flex-col items-start gap-1'>
            <Link
              to={`/job/${job.jobId}?source=${job.source || 'nyc'}`}
              className='text-primary-600 hover:text-primary-700 font-medium'
            >
              View Details →
            </Link>
            {job.externalUrl && (
              <a
                href={job.externalUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center text-primary-600 hover:text-primary-700 font-medium'
              >
                <HiExternalLink className='h-4 w-4 mr-1' />
                Apply externally
              </a>
            )}
          </div>
        ),
      },
    ],
    [bestSalaryKeys]
  );

  if (!isOpen || jobs.length === 0) return null;

  return (
    <div
      className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
      role='dialog'
      aria-modal='true'
      aria-labelledby='job-comparison-title'
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={modalRef} className='bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto'>
        <div className='flex justify-between items-center p-6 border-b border-gray-200'>
          <div>
            <h2 id='job-comparison-title' className='text-xl font-semibold text-gray-900'>
              Compare Jobs
            </h2>
            <p className='text-sm text-gray-600 mt-1'>
              {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} side by side
            </p>
          </div>
          <button
            ref={firstFocusRef}
            onClick={onClose}
            className='text-gray-400 hover:text-gray-600'
            aria-label='Close comparison'
          >
            <HiX className='h-6 w-6' />
          </button>
        </div>

        <div className='p-6'>
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-gray-200 text-sm'>
              <thead className='bg-gray-50'>
                <tr>
                  <th
                    scope='col'
                    className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32 min-w-[8rem]'
                  >
                    Field
                  </th>
                  {jobs.map((job) => (
                    <th
                      key={jobKey(job)}
                      scope='col'
                      className='px-4 py-3 text-left text-sm font-semibold text-gray-900 min-w-[14rem] align-top'
                    >
                      {job.businessTitle}
                      {job.civilServiceTitle && (
                        <span className='block text-xs font-normal text-gray-500 mt-1'>
                          {job.civilServiceTitle}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className='bg-white divide-y divide-gray-200'>
                {rows.map((row) => (
                  <tr key={row.label} className='align-top'>
                    <th
                      scope='row'
                      className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap'
                    >
                      {row.label}
                    </th>
                    {jobs.map((job) => (
                      <td
                        key={jobKey(job)}
                        className={`px-4 py-3 text-gray-700 ${
                          row.highlight?.(job) ? 'bg-green-50 font-medium text-gray-900' : ''
                        }`}
                      >
                        {row.render(job)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className='flex justify-end pt-6 mt-2 border-t border-gray-200'>
            <button type='button' onClick={onClose} className='btn btn-outline'>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobComparison;
