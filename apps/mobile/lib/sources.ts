// Mirrors shared/constants/index.js SOURCE_OPTIONS (plus 'mta').
// Keep in sync manually until the shared package is wired into Metro.
export const SOURCE_LABELS: Record<string, string> = {
  nyc: 'City',
  nys: 'State',
  federal: 'Federal',
  cuny: 'CUNY',
  nyu: 'NYU',
  fordham: 'Fordham',
  pa: 'Port Authority',
  mountsinai: 'Mount Sinai',
  idealist: 'Non-Profit',
  columbia: 'Columbia',
  nyp: 'NYP',
  northwell: 'Northwell',
  nyulangone: 'NYU Langone',
  newschool: 'New School',
  amtrak: 'Amtrak',
  un: 'United Nations',
  amnh: 'AMNH',
  metmuseum: 'Met Museum',
  frick: 'Frick Collection',
  guggenheim: 'Guggenheim',
  msk: 'MSK',
  montefiore: 'Montefiore',
  nypl: 'NYPL',
  nychhc: 'NYC H+H',
  mta: 'MTA',
};

export const getSourceLabel = (source?: string): string =>
  (source && SOURCE_LABELS[source]) || source || '';
