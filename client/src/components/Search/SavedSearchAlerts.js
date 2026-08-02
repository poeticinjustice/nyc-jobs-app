import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiBell,
  HiChevronDown,
  HiChevronUp,
  HiInformationCircle,
  HiTrash,
} from 'react-icons/hi';
import { SOURCE_OPTIONS } from 'nyc-jobs-shared/constants';
import {
  getSavedSearches,
  toggleSearchAlerts,
  markSearchSeen,
  getSearchMatches,
  deleteSavedSearch,
} from '../../store/slices/searchesSlice';
import LoadingSpinner from '../UI/LoadingSpinner';
import SourceBadge from '../UI/SourceBadge';
import { formatSalary, formatDate } from '../../utils/formatUtils';

const MATCH_PREVIEW_LIMIT = 5;

const sourceLabel = (value) =>
  SOURCE_OPTIONS.find((o) => o.value === value)?.label || value;

const SavedSearchAlerts = () => {
  const dispatch = useDispatch();
  const { savedSearches, matchesBySearch, emailAlertsAvailable, loading } = useSelector(
    (state) => state.searches
  );
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [expandedId, setExpandedId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [matchesLoadingId, setMatchesLoadingId] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      dispatch(getSavedSearches());
    }
  }, [dispatch, isAuthenticated]);

  const handleToggleAlerts = async (search) => {
    setActionLoading(search._id);
    try {
      await dispatch(
        toggleSearchAlerts({ id: search._id, enabled: !search.alertsEnabled })
      ).unwrap();
    } catch (err) {
      toast.error(err?.message || err || 'Failed to update alerts');
    }
    setActionLoading(null);
  };

  const handleDelete = async (search) => {
    if (!window.confirm(`Delete the saved search "${search.name}"?`)) return;
    setActionLoading(search._id);
    try {
      await dispatch(deleteSavedSearch(search._id)).unwrap();
      setExpandedId((prev) => (prev === search._id ? null : prev));
    } catch (err) {
      toast.error(err?.message || err || 'Failed to delete saved search');
    }
    setActionLoading(null);
  };

  const handleMarkSeen = async (search) => {
    setActionLoading(search._id);
    try {
      await dispatch(markSearchSeen(search._id)).unwrap();
      setExpandedId((prev) => (prev === search._id ? null : prev));
    } catch (err) {
      toast.error(err?.message || err || 'Failed to mark search as seen');
    }
    setActionLoading(null);
  };

  const handleToggleExpanded = async (search) => {
    if (expandedId === search._id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(search._id);
    if (matchesBySearch[search._id]) return;
    setMatchesLoadingId(search._id);
    try {
      await dispatch(getSearchMatches({ id: search._id, limit: MATCH_PREVIEW_LIMIT })).unwrap();
    } catch (err) {
      toast.error(err?.message || err || 'Failed to load new matches');
    }
    setMatchesLoadingId(null);
  };

  if (!isAuthenticated) return null;
  if (loading && savedSearches.length === 0) {
    return (
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex justify-center'>
        <LoadingSpinner size='md' />
      </div>
    );
  }
  if (savedSearches.length === 0) return null;

  return (
    <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
      <div className='flex items-center justify-between mb-4'>
        <div className='flex items-center'>
          <HiBell className='h-5 w-5 text-primary-600 mr-2' />
          <h2 className='text-lg font-semibold text-gray-900'>Saved Search Alerts</h2>
        </div>
        <Link to='/search' className='text-sm font-medium text-primary-600 hover:text-primary-700'>
          Manage in Search →
        </Link>
      </div>

      {!emailAlertsAvailable && (
        <p className='flex items-start text-xs text-gray-500 mb-4'>
          <HiInformationCircle className='h-4 w-4 mr-1.5 mt-px flex-shrink-0' />
          Email delivery isn&apos;t configured on this server — alerts will appear in-app only.
        </p>
      )}

      <div className='space-y-3'>
        {savedSearches.map((search) => {
          const isExpanded = expandedId === search._id;
          const matches = matchesBySearch[search._id] || [];
          const newCount = search.newCount || 0;

          return (
            <div
              key={search._id}
              className='border border-gray-200 rounded-lg p-3 hover:border-primary-300 transition-colors'
            >
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <p className='text-sm font-medium text-gray-900 truncate'>{search.name}</p>
                    {newCount > 0 && (
                      <span className='px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700 flex-shrink-0'>
                        {newCount} new
                      </span>
                    )}
                  </div>
                  <div className='flex flex-wrap gap-1 mt-1'>
                    {search.criteria?.q && (
                      <span className='px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs'>
                        {search.criteria.q}
                      </span>
                    )}
                    {search.criteria?.source && search.criteria.source !== 'all' && (
                      search.criteria.source.split(',').map((s) => (
                        <span key={s} className='px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs'>
                          {sourceLabel(s)}
                        </span>
                      ))
                    )}
                    {search.lastSeenAt && (
                      <span className='px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs'>
                        Last viewed {formatDate(search.lastSeenAt)}
                      </span>
                    )}
                  </div>
                </div>

                <div className='flex items-center gap-2 flex-shrink-0'>
                  <button
                    type='button'
                    role='switch'
                    aria-checked={Boolean(search.alertsEnabled)}
                    aria-label={`${search.alertsEnabled ? 'Disable' : 'Enable'} alerts for ${search.name}`}
                    onClick={() => handleToggleAlerts(search)}
                    disabled={actionLoading === search._id}
                    className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                      search.alertsEnabled
                        ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Alerts {search.alertsEnabled ? 'On' : 'Off'}
                  </button>
                  <Link
                    to={`/search?savedSearch=${search._id}`}
                    className='text-xs font-medium px-3 py-1 rounded-full border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors'
                  >
                    Run search
                  </Link>
                  {newCount > 0 && (
                    <button
                      type='button'
                      onClick={() => handleToggleExpanded(search)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Hide' : 'Preview'} new matches for ${search.name}`}
                      className='inline-flex items-center text-xs font-medium px-3 py-1 rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors'
                    >
                      {isExpanded ? (
                        <HiChevronUp className='h-3.5 w-3.5 mr-1' />
                      ) : (
                        <HiChevronDown className='h-3.5 w-3.5 mr-1' />
                      )}
                      Preview
                    </button>
                  )}
                  <button
                    type='button'
                    onClick={() => handleDelete(search)}
                    disabled={actionLoading === search._id}
                    className='p-1 text-gray-400 hover:text-red-600 disabled:opacity-50'
                    aria-label={`Delete saved search ${search.name}`}
                    title='Delete saved search'
                  >
                    <HiTrash className='h-4 w-4' />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className='mt-3 pt-3 border-t border-gray-200'>
                  {matchesLoadingId === search._id ? (
                    <div className='flex justify-center py-4'>
                      <LoadingSpinner size='sm' />
                    </div>
                  ) : matches.length === 0 ? (
                    <p className='text-sm text-gray-500'>No new matches to preview.</p>
                  ) : (
                    <ul className='space-y-2'>
                      {matches.map((job) => (
                        <li key={`${job.source}-${job.jobId}`}>
                          <Link
                            to={`/job/${job.jobId}?source=${job.source || 'nyc'}`}
                            className='block p-2 rounded-md hover:bg-gray-50 transition-colors'
                          >
                            <div className='flex items-center gap-2'>
                              <span className='text-sm font-medium text-gray-900 truncate'>
                                {job.businessTitle}
                              </span>
                              <SourceBadge source={job.source} size='sm' />
                            </div>
                            <p className='text-xs text-gray-500 mt-0.5'>
                              {job.agency || 'Agency not specified'} &middot;{' '}
                              {formatSalary(job.salaryRangeFrom, job.salaryRangeTo, job.salaryFrequency)}{' '}
                              &middot; Posted {formatDate(job.postDate)}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className='flex justify-end mt-3'>
                    <button
                      type='button'
                      onClick={() => handleMarkSeen(search)}
                      disabled={actionLoading === search._id}
                      className='text-xs font-medium px-3 py-1 rounded text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50'
                    >
                      Mark as seen
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SavedSearchAlerts;
