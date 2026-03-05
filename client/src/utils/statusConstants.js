import { APPLICATION_STATUSES as SHARED_STATUSES } from 'nyc-jobs-shared/constants';

// Tailwind color classes are UI-specific — not in shared
const STATUS_COLOR_MAP = {
  interested: 'bg-gray-100 text-gray-800',
  applied: 'bg-blue-100 text-blue-800',
  interviewing: 'bg-purple-100 text-purple-800',
  offered: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

// Merge shared status data with client-side colors
export const APPLICATION_STATUSES = SHARED_STATUSES.map((s) => ({
  ...s,
  color: STATUS_COLOR_MAP[s.value] || 'bg-gray-100 text-gray-800',
}));

// Extended colors used on Home dashboard (includes bar color for progress indicators)
export const STATUS_COLORS = {
  interested: { bg: 'bg-gray-100', text: 'text-gray-800', bar: 'bg-gray-400' },
  applied: { bg: 'bg-blue-100', text: 'text-blue-800', bar: 'bg-blue-500' },
  interviewing: { bg: 'bg-purple-100', text: 'text-purple-800', bar: 'bg-purple-500' },
  offered: { bg: 'bg-green-100', text: 'text-green-800', bar: 'bg-green-500' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', bar: 'bg-red-500' },
};

export const getStatusColor = (status) => {
  return APPLICATION_STATUSES.find((s) => s.value === status)?.color || 'bg-gray-100 text-gray-800';
};
