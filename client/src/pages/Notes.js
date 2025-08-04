import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getNotes, deleteNote, setFilters } from '../store/slices/notesSlice';
import { HiPlus, HiPencil, HiTrash, HiEye } from 'react-icons/hi';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import NoteModal from '../components/Notes/NoteModal';

const Notes = () => {
  const dispatch = useDispatch();
  const { notes, loading, error, filters } = useSelector(
    (state) => state.notes
  );
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState({
    type: '',
    priority: '',
  });
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null);

  useEffect(() => {
    dispatch(getNotes(filters));
  }, [dispatch, filters]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setLocalFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleApplyFilters = () => {
    dispatch(setFilters(localFilters));
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

  const handleCloseModal = () => {
    setShowNoteModal(false);
    setEditingNote(null);
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
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
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
                    {note.job && <span>Job: {note.job.businessTitle}</span>}
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
                    className='p-2 text-gray-400 hover:text-primary-600 transition-colors'
                    title='View note'
                  >
                    <HiEye className='h-5 w-5' />
                  </button>
                  <button
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
        note={editingNote}
      />
    </div>
  );
};

export default Notes;
