import React from 'react';

const SOURCE_CONFIG = {
  federal: { label: 'Federal', shortLabel: 'Fed', className: 'bg-blue-100 text-blue-800' },
  adzuna: { label: 'Private', shortLabel: 'Private', className: 'bg-orange-100 text-orange-800' },
  nyc: { label: 'NYC', shortLabel: 'NYC', className: 'bg-green-100 text-green-800' },
};

const SourceBadge = ({ source, size = 'md' }) => {
  const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.nyc;
  const isSmall = size === 'sm';

  return (
    <span
      className={`shrink-0 rounded-full font-medium ${config.className} ${
        isSmall
          ? 'px-1.5 py-0.5 text-[10px]'
          : 'px-2 py-0.5 text-xs'
      }`}
    >
      {isSmall ? config.shortLabel : config.label}
    </span>
  );
};

export default SourceBadge;
