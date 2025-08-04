import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { createNote, updateNote } from '../../store/slices/notesSlice';
import { HiX, HiSave, HiPencil } from 'react-icons/hi';

const NoteModal = ({
  isOpen,
  onClose,
  note = null,
  jobId = null,
  jobTitle = null,
}) => {
  const dispatch = useDispatch();
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'general',
    priority: 'medium',
    isPrivate: false,
    tags: '',
  });

  useEffect(() => {
    if (note) {
      setFormData({
        title: note.title || '',
        content: note.content || '',
        type: note.type || 'general',
        priority: note.priority || 'medium',
        isPrivate: note.isPrivate || false,
        tags: note.tags ? note.tags.join(', ') : '',
      });
    } else {
      setFormData({
        title: '',
        content: '',
        type: 'general',
        priority: 'medium',
        isPrivate: false,
        tags: '',
      });
    }
  }, [note]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const noteData = {
      ...formData,
      tags: formData.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag),
      job: jobId,
    };

    try {
      if (note) {
        await dispatch(updateNote({ id: note._id, ...noteData })).unwrap();
      } else {
        await dispatch(createNote(noteData)).unwrap();
      }
      onClose();
    } catch (error) {
      console.error('Error saving note:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
      <div className='bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto'>
        <div className='flex justify-between items-center p-6 border-b border-gray-200'>
          <h2 className='text-xl font-semibold text-gray-900'>
            {note ? 'Edit Note' : 'Create Note'}
          </h2>
          <button
            onClick={onClose}
            className='text-gray-400 hover:text-gray-600'
          >
            <HiX className='h-6 w-6' />
          </button>
        </div>

        <form onSubmit={handleSubmit} className='p-6 space-y-6'>
          {jobTitle && (
            <div className='bg-blue-50 border border-blue-200 rounded-lg p-4'>
              <p className='text-sm text-blue-800'>
                <strong>Job:</strong> {jobTitle}
              </p>
            </div>
          )}

          <div>
            <label className='block text-sm font-medium text-gray-700 mb-2'>
              Title *
            </label>
            <input
              type='text'
              name='title'
              value={formData.title}
              onChange={handleChange}
              required
              className='input w-full'
              placeholder='Note title'
            />
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 mb-2'>
              Content *
            </label>
            <textarea
              name='content'
              value={formData.content}
              onChange={handleChange}
              required
              rows={6}
              className='input w-full'
              placeholder='Write your note here...'
            />
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Type
              </label>
              <select
                name='type'
                value={formData.type}
                onChange={handleChange}
                className='input w-full'
              >
                <option value='general'>General</option>
                <option value='interview'>Interview</option>
                <option value='application'>Application</option>
                <option value='followup'>Follow-up</option>
                <option value='research'>Research</option>
              </select>
            </div>

            <div>
              <label className='block text-sm font-medium text-gray-700 mb-2'>
                Priority
              </label>
              <select
                name='priority'
                value={formData.priority}
                onChange={handleChange}
                className='input w-full'
              >
                <option value='low'>Low</option>
                <option value='medium'>Medium</option>
                <option value='high'>High</option>
                <option value='urgent'>Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className='block text-sm font-medium text-gray-700 mb-2'>
              Tags
            </label>
            <input
              type='text'
              name='tags'
              value={formData.tags}
              onChange={handleChange}
              className='input w-full'
              placeholder='Enter tags separated by commas'
            />
          </div>

          <div className='flex items-center'>
            <input
              type='checkbox'
              name='isPrivate'
              checked={formData.isPrivate}
              onChange={handleChange}
              className='h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded'
            />
            <label className='ml-2 block text-sm text-gray-900'>
              Private note (only visible to you)
            </label>
          </div>

          <div className='flex justify-end space-x-3 pt-4 border-t border-gray-200'>
            <button type='button' onClick={onClose} className='btn btn-outline'>
              Cancel
            </button>
            <button type='submit' className='btn btn-primary flex items-center'>
              {note ? (
                <HiPencil className='h-4 w-4 mr-2' />
              ) : (
                <HiSave className='h-4 w-4 mr-2' />
              )}
              {note ? 'Update Note' : 'Create Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NoteModal;
