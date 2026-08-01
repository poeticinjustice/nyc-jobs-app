import React from 'react';

const SOURCE_CONFIG = {
  nyc: { label: 'NYC', shortLabel: 'NYC', className: 'bg-green-100 text-green-800' },
  nys: { label: 'State', shortLabel: 'NYS', className: 'bg-emerald-100 text-emerald-800' },
  federal: { label: 'Federal', shortLabel: 'Fed', className: 'bg-blue-100 text-blue-800' },
  cuny: { label: 'CUNY', shortLabel: 'CUNY', className: 'bg-indigo-100 text-indigo-800' },
  nyu: { label: 'NYU', shortLabel: 'NYU', className: 'bg-violet-100 text-violet-800' },
  columbia: { label: 'Columbia', shortLabel: 'CU', className: 'bg-sky-100 text-sky-800' },
  fordham: { label: 'Fordham', shortLabel: 'Ford', className: 'bg-rose-100 text-rose-800' },
  newschool: { label: 'New School', shortLabel: 'TNS', className: 'bg-fuchsia-100 text-fuchsia-800' },
  pa: { label: 'Port Authority', shortLabel: 'PA', className: 'bg-slate-100 text-slate-800' },
  mta: { label: 'MTA', shortLabel: 'MTA', className: 'bg-indigo-100 text-indigo-800' },
  mountsinai: { label: 'Mount Sinai', shortLabel: 'Sinai', className: 'bg-purple-100 text-purple-800' },
  nyp: { label: 'NYP', shortLabel: 'NYP', className: 'bg-red-100 text-red-800' },
  northwell: { label: 'Northwell', shortLabel: 'NW', className: 'bg-lime-100 text-lime-800' },
  nyulangone: { label: 'NYU Langone', shortLabel: 'Lang', className: 'bg-violet-100 text-violet-800' },
  msk: { label: 'MSK', shortLabel: 'MSK', className: 'bg-pink-100 text-pink-800' },
  montefiore: { label: 'Montefiore', shortLabel: 'Monte', className: 'bg-teal-100 text-teal-800' },
  nychhc: { label: 'NYC H+H', shortLabel: 'H+H', className: 'bg-cyan-100 text-cyan-800' },
  amnh: { label: 'AMNH', shortLabel: 'AMNH', className: 'bg-amber-100 text-amber-800' },
  metmuseum: { label: 'Met Museum', shortLabel: 'Met', className: 'bg-rose-100 text-rose-800' },
  frick: { label: 'Frick', shortLabel: 'Frick', className: 'bg-stone-100 text-stone-800' },
  guggenheim: { label: 'Guggenheim', shortLabel: 'Gug', className: 'bg-orange-100 text-orange-800' },
  idealist: { label: 'Non-Profit', shortLabel: 'NP', className: 'bg-yellow-100 text-yellow-800' },
  nypl: { label: 'NYPL', shortLabel: 'NYPL', className: 'bg-red-100 text-red-800' },
  amtrak: { label: 'Amtrak', shortLabel: 'Amtk', className: 'bg-blue-100 text-blue-800' },
  un: { label: 'United Nations', shortLabel: 'UN', className: 'bg-sky-100 text-sky-800' },
};

const SourceBadge = ({ source, size = 'md' }) => {
  const config = SOURCE_CONFIG[source] || { label: source, shortLabel: source, className: 'bg-gray-100 text-gray-800' };
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
