import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { createNote, updateNote, clearError } from '../../store/slices/notesSlice';
import { HiX, HiSave, HiPencil } from 'react-icons/hi';
import { NOTE_TITLE_MAX, NOTE_CONTENT_MAX } from '../../utils/validation';

const INITIAL_FORM_DATA = {
  title: '',
  content: '',
  type: 'general',
  priority: 'medium',
  tags: '',
};

const NoteModal = ({
  isOpen,
  onClose,
  note = null,
  jobId = null,
  jobTitle = null,
  source = null,
  isViewMode = false,
}) => {
  const dispatch = useDispatch();
  const { createLoading, updateLoading, error } = useSelector((state) => state.notes);
  const submitting = createLoading || updateLoading;
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const modalRef = useRef(null);
  const firstFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    dispatch(clearError());
    if (note) {
      setFormData({
        title: note.title || '',
        content: note.content || '',
        type: note.type || 'general',
        priority: note.priority || 'medium',
        tags: note.tags ? note.tags.join(', ') : '',
      });
    } else {
      setFormData(INITIAL_FORM_DATA);
    }
  }, [note, isOpen, dispatch]);

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

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (submitting) return;

    const noteData = {
      ...formData,
      tags: formData.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag),
      jobId: jobId,
      source: source,
    };

    try {
      if (note) {
        await dispatch(updateNote({ noteId: note._id, noteData })).unwrap();
      } else {
        await dispatch(createNote(noteData)).unwrap();
      }
      onClose();
    } catch {
      // Error is stored in Redux state and displayed in the modal
    }
  }, [submitting, formData, jobId, source, note, dispatch, onClose]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  if (!isOpen) return null;

  return (
    <div
      className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
      role='dialog'
      aria-modal='true'
      aria-labelledby='note-modal-title'
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={modalRef} className='bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto'>
        <div className='flex justify-between items-center p-6 border-b border-gray-200'>
          <h2 id='note-modal-title' className='text-xl font-semibold text-gray-900'>
            {isViewMode ? 'View Note' : note ? 'Edit Note' : 'Create Note'}
          </h2>
          <button
            ref={isViewMode ? firstFocusRef : null}
            onClick={onClose}
            className='text-gray-400 hover:text-gray-600'
            aria-label='Close modal'
          >
            <HiX className='h-6 w-6' />
          </button>
        </div>

        {error && (
          <div className='mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg'>
            <p className='text-sm text-red-800'>{error}</p>
          </div>
        )}

        {isViewMode ? (
          <div className='p-6 space-y-6'>
            {jobTitle && (
              <div className='bg-blue-50 border border-blue-200 rounded-lg p-4'>
                <p className='text-sm text-blue-800'>
                  <strong>Job:</strong> {jobTitle}
                </p>
              </div>
            )}

            <div>
              <p className='block text-sm font-medium text-gray-700 mb-2'>Title</p>
              <p className='text-gray-900 font-medium'>{note?.title}</p>
            </div>

            <div>
              <p className='block text-sm font-medium text-gray-700 mb-2'>Content</p>
              <div className='bg-gray-50 border border-gray-200 rounded-lg p-4'>
                <p className='text-gray-900 whitespace-pre-wrap'>{note?.content}</p>
              </div>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <p className='block text-sm font-medium text-gray-700 mb-2'>Type</p>
                <p className='text-gray-900 capitalize'>{note?.type}</p>
              </div>
              <div>
                <p className='block text-sm font-medium text-gray-700 mb-2'>Priority</p>
                <p className='text-gray-900 capitalize'>{note?.priority}</p>
              </div>
            </div>

            {note?.tags && note.tags.length > 0 && (
              <div>
                <p className='block text-sm font-medium text-gray-700 mb-2'>Tags</p>
                <div className='flex flex-wrap gap-2'>
                  {note.tags.map((tag, index) => (
                    <span key={index} className='px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full'>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className='flex justify-end pt-4 border-t border-gray-200'>
              <button type='button' onClick={onClose} className='btn btn-outline'>
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className='p-6 space-y-6'>
            {jobTitle && (
              <div className='bg-blue-50 border border-blue-200 rounded-lg p-4'>
                <p className='text-sm text-blue-800'>
                  <strong>Job:</strong> {jobTitle}
                </p>
              </div>
            )}

            <div>
              <label htmlFor='note-title' className='block text-sm font-medium text-gray-700 mb-2'>
                Title *
              </label>
              <input
                ref={firstFocusRef}
                id='note-title'
                type='text'
                name='title'
                value={formData.title}
                onChange={handleChange}
                required
                maxLength={NOTE_TITLE_MAX}
                className='input w-full'
                placeholder='Note title'
              />
              <span className={`text-xs mt-1 block text-right ${formData.title.length > NOTE_TITLE_MAX * 0.9 ? 'text-red-500' : 'text-gray-400'}`}>
                {formData.title.length}/{NOTE_TITLE_MAX}
              </span>
            </div>

            <div>
              <label htmlFor='note-content' className='block text-sm font-medium text-gray-700 mb-2'>
                Content *
              </label>
              <textarea
                id='note-content'
                name='content'
                value={formData.content}
                onChange={handleChange}
                required
                maxLength={NOTE_CONTENT_MAX}
                rows={6}
                className='input w-full'
                placeholder='Write your note here...'
              />
              <span className={`text-xs mt-1 block text-right ${formData.content.length > NOTE_CONTENT_MAX * 0.9 ? 'text-red-500' : 'text-gray-400'}`}>
                {formData.content.length}/{NOTE_CONTENT_MAX}
              </span>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <label htmlFor='note-type' className='block text-sm font-medium text-gray-700 mb-2'>
                  Type
                </label>
                <select id='note-type' name='type' value={formData.type} onChange={handleChange} className='input w-full'>
                  <option value='general'>General</option>
                  <option value='interview'>Interview</option>
                  <option value='application'>Application</option>
                  <option value='followup'>Follow-up</option>
                  <option value='research'>Research</option>
                </select>
              </div>

              <div>
                <label htmlFor='note-priority' className='block text-sm font-medium text-gray-700 mb-2'>
                  Priority
                </label>
                <select id='note-priority' name='priority' value={formData.priority} onChange={handleChange} className='input w-full'>
                  <option value='low'>Low</option>
                  <option value='medium'>Medium</option>
                  <option value='high'>High</option>
                  <option value='urgent'>Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor='note-tags' className='block text-sm font-medium text-gray-700 mb-2'>
                Tags
              </label>
              <input
                id='note-tags'
                type='text'
                name='tags'
                value={formData.tags}
                onChange={handleChange}
                className='input w-full'
                placeholder='Enter tags separated by commas'
              />
            </div>

            <div className='flex justify-end space-x-3 pt-4 border-t border-gray-200'>
              <button type='button' onClick={onClose} className='btn btn-outline' disabled={submitting}>
                Cancel
              </button>
              <button type='submit' className='btn btn-primary flex items-center' disabled={submitting}>
                {note ? <HiPencil className='h-4 w-4 mr-2' /> : <HiSave className='h-4 w-4 mr-2' />}
                {submitting ? 'Saving...' : note ? 'Update Note' : 'Create Note'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default NoteModal;
