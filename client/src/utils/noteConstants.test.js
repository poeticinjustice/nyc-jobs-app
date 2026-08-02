import { NOTE_TYPE_VALUES, NOTE_PRIORITY_VALUES } from 'nyc-jobs-shared/constants';
import {
  NOTE_TYPE_COLORS,
  NOTE_PRIORITY_COLORS,
  getNoteTypeColor,
  getNotePriorityColor,
} from './noteConstants';

describe('noteConstants', () => {
  it('has a color for every shared note type', () => {
    expect(Object.keys(NOTE_TYPE_COLORS).sort()).toEqual([...NOTE_TYPE_VALUES].sort());
  });

  it('has a color for every shared note priority', () => {
    expect(Object.keys(NOTE_PRIORITY_COLORS).sort()).toEqual([...NOTE_PRIORITY_VALUES].sort());
  });

  it('uses the canonical Notes-page palette', () => {
    expect(getNoteTypeColor('application')).toBe('bg-purple-100 text-purple-800');
    expect(getNoteTypeColor('followup')).toBe('bg-indigo-100 text-indigo-800');
    expect(getNoteTypeColor('research')).toBe('bg-teal-100 text-teal-800');
    expect(getNotePriorityColor('urgent')).toBe('bg-red-100 text-red-800');
  });

  it('falls back to neutral colors for unknown values', () => {
    expect(getNoteTypeColor('nope')).toBe('bg-gray-100 text-gray-800');
    expect(getNotePriorityColor(undefined)).toBe('bg-gray-100 text-gray-800');
  });
});
