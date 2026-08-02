import React from 'react';
import { getDeadlineInfo } from '../../utils/formatUtils';

// Tailwind classes per urgency level returned by getDeadlineInfo
// ('urgent' | 'warning' | 'closed'). Colors are UI-specific — not in shared.
const DEADLINE_TONES = {
  closed: {
    badge: 'bg-gray-100 text-gray-700',
    text: 'text-gray-500',
    banner: 'bg-gray-50 border-gray-200',
    bannerAccent: 'text-gray-500',
    bannerText: 'text-gray-700',
  },
  urgent: {
    badge: 'bg-red-100 text-red-700',
    text: 'text-red-600',
    banner: 'bg-red-50 border-red-200',
    bannerAccent: 'text-red-500',
    bannerText: 'text-red-700',
  },
  warning: {
    badge: 'bg-yellow-100 text-yellow-700',
    text: 'text-yellow-600',
    banner: 'bg-yellow-50 border-yellow-200',
    bannerAccent: 'text-yellow-500',
    bannerText: 'text-yellow-700',
  },
};

// Anything that isn't closed or urgent reads as a warning, matching the
// urgency ternaries this replaced.
export const getDeadlineTone = (urgency) =>
  DEADLINE_TONES[urgency] || DEADLINE_TONES.warning;

/**
 * Renders the "Closes in N days" deadline indicator, or nothing when the
 * posting has no deadline worth flagging.
 *
 * variant='badge' — pill used in job lists and the comparison table
 * variant='text'  — parenthesised inline label used beside a formatted date
 */
const DeadlineBadge = ({ postUntil, variant = 'badge', className = '' }) => {
  const deadline = getDeadlineInfo(postUntil);
  if (!deadline) return null;

  const tone = getDeadlineTone(deadline.urgency);
  const extra = className ? ` ${className}` : '';

  if (variant === 'text') {
    return (
      <span className={`text-sm font-medium ${tone.text}${extra}`}>
        ({deadline.label})
      </span>
    );
  }

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tone.badge}${extra}`}>
      {deadline.label}
    </span>
  );
};

export default DeadlineBadge;
