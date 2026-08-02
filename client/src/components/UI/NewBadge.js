import React from 'react';

// Small "New" pill for jobs added since the user last marked results as seen
const NewBadge = ({ size = 'md' }) => {
  const isSmall = size === 'sm';

  return (
    <span
      className={`shrink-0 rounded-full font-medium bg-primary-100 text-primary-800 ${
        isSmall
          ? 'px-1.5 py-0.5 text-[10px]'
          : 'px-2 py-0.5 text-xs'
      }`}
    >
      New
    </span>
  );
};

export default NewBadge;
