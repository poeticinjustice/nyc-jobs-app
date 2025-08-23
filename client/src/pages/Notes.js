import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getNotes, deleteNote, setFilters } from '../store/slices/notesSlice';
import {
  HiPlus,
  HiPencil,
  HiTrash,
  HiEye,
  HiExternalLink,
  HiChevronLeft,
  HiChevronRight,
} from 'react-icons/hi';
import { Link, useSearchParams } from 'react-router-dom';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import NoteModal from '../components/Notes/NoteModal';

const Notes = () => {
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const { notes, loading, error, filters, pagination } = useSelector(
    (state) => state.notes
  );
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState({
    type: '',
    priority: '',
  });
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [viewingNote, setViewingNote] = useState(null);

  // Get current page from URL params or default to 1
  const currentPage = parseInt(searchParams.get('page') || '1');
  const pageSize = 20; // Number of notes per page

  // Initial load of notes
  useEffect(() => {
    const updatedFilters = {
      ...filters,
      page: currentPage,
      limit: pageSize,
    };
    dispatch(getNotes(updatedFilters));
  }, []); // Only run on mount

  useEffect(() => {
    // Fetch notes with current filters and pagination
    const updatedFilters = {
      ...filters,
      page: currentPage,
      limit: pageSize,
    };
    dispatch(getNotes(updatedFilters));
  }, [dispatch, filters, currentPage, pageSize]);

  // Update URL when page changes
  const handlePageChange = (newPage) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set('page', newPage.toString());
      return newParams;
    });
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setLocalFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleApplyFilters = () => {
    // Update Redux filters
    dispatch(setFilters(localFilters));

    // Reset to page 1 and fetch notes with new filters
    const updatedFilters = {
      ...localFilters,
      page: 1,
      limit: pageSize,
    };

    // Update URL to page 1
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.set('page', '1');
      return newParams;
    });

    // Fetch notes immediately
    dispatch(getNotes(updatedFilters));
  };

  const handleDeleteNote = (noteId) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      dispatch(deleteNote(noteId));
    }
  };

  const handleAddNote = () => {
    setEditingNote(null);
    setShowNoteModal(true);
  };

  const handleEditNote = (note) => {
    setEditingNote(note);
    setShowNoteModal(true);
  };

  const handleViewNote = (note) => {
    setViewingNote(note);
    setShowNoteModal(true);
  };

  const handleCloseModal = () => {
    setShowNoteModal(false);
    setEditingNote(null);
    setViewingNote(null);
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'interview':
        return 'bg-blue-100 text-blue-800';
      case 'application':
        return 'bg-purple-100 text-purple-800';
      case 'followup':
        return 'bg-indigo-100 text-indigo-800';
      case 'research':
        return 'bg-teal-100 text-teal-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
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
            <h1 className='text-2xl font-bold text-gray-900'>My Notes</h1>
            <p className='text-gray-600 mt-1'>
              {pagination?.total || notes.length}{' '}
              {(pagination?.total || notes.length) === 1 ? 'note' : 'notes'}
            </p>
          </div>
          <button
            onClick={handleAddNote}
            className='btn btn-primary flex items-center'
          >
            <HiPlus className='h-5 w-5 mr-2' />
            Add Note
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <div className='flex justify-between items-center mb-4'>
          <h2 className='text-lg font-semibold text-gray-900'>Filters</h2>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className='text-primary-600 hover:text-primary-700'
          >
            {showFilters ? 'Hide' : 'Show'} Filters
          </button>
        </div>

        {showFilters && (
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <div>
              <label className='block text-sm font-medium text-gray-700 mb-1'>
                Type
              </label>
              <select
                name='type'
                value={localFilters.type}
                onChange={handleFilterChange}
                className='input'
              >
                <option value=''>All Types</option>
                <option value='general'>General</option>
                <option value='interview'>Interview</option>
                <option value='application'>Application</option>
                <option value='followup'>Follow-up</option>
                <option value='research'>Research</option>
              </select>
            </div>

            <div>
              <label className='block text-sm font-medium text-gray-700 mb-1'>
                Priority
              </label>
              <select
                name='priority'
                value={localFilters.priority}
                onChange={handleFilterChange}
                className='input'
              >
                <option value=''>All Priorities</option>
                <option value='low'>Low</option>
                <option value='medium'>Medium</option>
                <option value='high'>High</option>
                <option value='urgent'>Urgent</option>
              </select>
            </div>

            <div className='flex items-end'>
              <button
                onClick={handleApplyFilters}
                className='btn btn-primary w-full'
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notes List */}
      {notes.length > 0 ? (
        <div className='space-y-4'>
          {notes.map((note) => (
            <div
              key={note._id}
              className='bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow'
            >
              <div className='flex justify-between items-start'>
                <div className='flex-1'>
                  <div className='flex items-center space-x-2 mb-2'>
                    <h3 className='text-lg font-semibold text-gray-900'>
                      {note.title}
                    </h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(
                        note.type
                      )}`}
                    >
                      {note.type}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(
                        note.priority
                      )}`}
                    >
                      {note.priority}
                    </span>
                    {note.isPrivate && (
                      <span className='px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800'>
                        Private
                      </span>
                    )}
                  </div>

                  <p className='text-gray-600 mb-3'>
                    {note.content.length > 200
                      ? `${note.content.substring(0, 200)}...`
                      : note.content}
                  </p>

                  <div className='flex items-center space-x-4 text-sm text-gray-500'>
                    <span>Created: {formatDate(note.createdAt)}</span>
                    {note.job && (
                      <Link
                        to={`/job/${note.job.jobId}`}
                        className='text-primary-600 hover:text-primary-700 flex items-center'
                      >
                        <HiExternalLink className='h-4 w-4 mr-1' />
                        {note.job.businessTitle}
                      </Link>
                    )}
                  </div>

                  {note.tags && note.tags.length > 0 && (
                    <div className='mt-3 flex flex-wrap gap-2'>
                      {note.tags.map((tag, index) => (
                        <span
                          key={index}
                          className='px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full'
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className='flex space-x-2 ml-4'>
                  <button
                    onClick={() => handleViewNote(note)}
                    className='p-2 text-gray-400 hover:text-primary-600 transition-colors'
                    title='View note'
                  >
                    <HiEye className='h-5 w-5' />
                  </button>
                  <button
                    onClick={() => handleEditNote(note)}
                    className='p-2 text-gray-400 hover:text-blue-600 transition-colors'
                    title='Edit note'
                  >
                    <HiPencil className='h-5 w-5' />
                  </button>
                  <button
                    onClick={() => handleDeleteNote(note._id)}
                    className='p-2 text-gray-400 hover:text-red-600 transition-colors'
                    title='Delete note'
                  >
                    <HiTrash className='h-5 w-5' />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center'>
          <HiPlus className='h-12 w-12 text-gray-400 mx-auto mb-4' />
          <h3 className='text-lg font-medium text-gray-900 mb-2'>
            No notes yet
          </h3>
          <p className='text-gray-600 mb-4'>
            Start creating notes for your job applications to stay organized.
          </p>
          <button onClick={handleAddNote} className='btn btn-primary'>
            Create Your First Note
          </button>
        </div>
      )}

      {/* Note Modal */}
      <NoteModal
        isOpen={showNoteModal}
        onClose={handleCloseModal}
        note={editingNote || viewingNote}
        jobId={
          editingNote?.jobId ||
          viewingNote?.jobId ||
          editingNote?.job?.jobId ||
          viewingNote?.job?.jobId
        }
        jobTitle={
          editingNote?.job?.businessTitle || viewingNote?.job?.businessTitle
        }
        isViewMode={!!viewingNote}
      />

      {/* Pagination */}
      {notes.length > 0 && pagination && pagination.pages > 1 && (
        <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
          <div className='flex items-center justify-between'>
            <div className='text-sm text-gray-700'>
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, pagination.total)} of{' '}
              {pagination.total} notes
            </div>

            <div className='flex items-center space-x-2'>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className={`p-2 rounded-lg border transition-colors ${
                  currentPage <= 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300'
                }`}
              >
                <HiChevronLeft className='h-5 w-5' />
              </button>

              <div className='flex items-center space-x-1'>
                {Array.from(
                  { length: Math.min(5, pagination.pages) },
                  (_, i) => {
                    let pageNum;
                    if (pagination.pages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= pagination.pages - 2) {
                      pageNum = pagination.pages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 py-2 rounded-lg border transition-colors ${
                          pageNum === currentPage
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                )}
              </div>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= pagination.pages}
                className={`p-2 rounded-lg border transition-colors ${
                  currentPage >= pagination.pages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300'
                }`}
              >
                <HiChevronRight className='h-5 w-5' />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notes;
