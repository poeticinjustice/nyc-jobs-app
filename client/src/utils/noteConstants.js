import { NOTE_TYPE_VALUES, NOTE_PRIORITY_VALUES } from 'nyc-jobs-shared/constants';

// Tailwind color classes are UI-specific — not in shared. This is the palette
// from the user-facing Notes page; Admin reuses it so the two can't drift.
const NEUTRAL = 'bg-gray-100 text-gray-800';

const TYPE_COLOR_MAP = {
  general: NEUTRAL,
  interview: 'bg-blue-100 text-blue-800',
  application: 'bg-purple-100 text-purple-800',
  followup: 'bg-indigo-100 text-indigo-800',
  research: 'bg-teal-100 text-teal-800',
};

const PRIORITY_COLOR_MAP = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

// Keyed off the shared value lists so a new note type/priority shows up here
// (with a neutral color) instead of silently falling through.
export const NOTE_TYPE_COLORS = Object.fromEntries(
  NOTE_TYPE_VALUES.map((value) => [value, TYPE_COLOR_MAP[value] || NEUTRAL])
);

export const NOTE_PRIORITY_COLORS = Object.fromEntries(
  NOTE_PRIORITY_VALUES.map((value) => [value, PRIORITY_COLOR_MAP[value] || NEUTRAL])
);

export const getNoteTypeColor = (type) => NOTE_TYPE_COLORS[type] || NEUTRAL;

export const getNotePriorityColor = (priority) =>
  NOTE_PRIORITY_COLORS[priority] || NEUTRAL;
