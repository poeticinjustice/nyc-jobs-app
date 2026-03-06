// Static geocoding for NYC job locations
// Maps known location strings to coordinates without external API calls

const LOCATION_COORDS = {
  // NYC Boroughs (center points)
  'manhattan': { lat: 40.7831, lng: -73.9712 },
  'brooklyn': { lat: 40.6782, lng: -73.9442 },
  'queens': { lat: 40.7282, lng: -73.7949 },
  'bronx': { lat: 40.8448, lng: -73.8648 },
  'the bronx': { lat: 40.8448, lng: -73.8648 },
  'staten island': { lat: 40.5795, lng: -74.1502 },

  // Common NYC neighborhoods / areas
  'downtown manhattan': { lat: 40.7128, lng: -74.0060 },
  'midtown manhattan': { lat: 40.7549, lng: -73.9840 },
  'lower manhattan': { lat: 40.7075, lng: -74.0113 },
  'upper manhattan': { lat: 40.8300, lng: -73.9430 },
  'harlem': { lat: 40.8116, lng: -73.9465 },
  'east harlem': { lat: 40.7957, lng: -73.9425 },
  'washington heights': { lat: 40.8417, lng: -73.9393 },
  'long island city': { lat: 40.7447, lng: -73.9485 },
  'downtown brooklyn': { lat: 40.6934, lng: -73.9905 },
  'jamaica': { lat: 40.7029, lng: -73.7898 },
  'flushing': { lat: 40.7675, lng: -73.8330 },
  'east new york': { lat: 40.6590, lng: -73.8759 },
  'coney island': { lat: 40.5755, lng: -73.9707 },
  'wards island': { lat: 40.7932, lng: -73.9251 },
  'randalls island': { lat: 40.7932, lng: -73.9251 },

  // Multi-borough / citywide
  'all 5 boroughs': { lat: 40.7128, lng: -74.0060 },
  'all five boroughs': { lat: 40.7128, lng: -74.0060 },
  'all boroughs': { lat: 40.7128, lng: -74.0060 },
  'citywide': { lat: 40.7128, lng: -74.0060 },
  'nyc citywide': { lat: 40.7128, lng: -74.0060 },
  'various': { lat: 40.7128, lng: -74.0060 },
  'various locations': { lat: 40.7128, lng: -74.0060 },

  // Common NYC government office addresses
  'city hall': { lat: 40.7128, lng: -74.0060 },
  'world trade center': { lat: 40.7127, lng: -74.0134 },

  // Federal job locations
  'new york, new york': { lat: 40.7128, lng: -74.0060 },
  'new york, ny': { lat: 40.7128, lng: -74.0060 },
  'new york': { lat: 40.7128, lng: -74.0060 },
  'nyc': { lat: 40.7128, lng: -74.0060 },
};

// NYC street address → approximate coordinates (common government buildings)
const ADDRESS_COORDS = [
  { pattern: '100 church', coords: { lat: 40.7132, lng: -74.0079 } },
  { pattern: '1 centre', coords: { lat: 40.7138, lng: -74.0020 } },
  { pattern: '1 center', coords: { lat: 40.7138, lng: -74.0020 } },
  { pattern: '2 lafayette', coords: { lat: 40.7152, lng: -74.0000 } },
  { pattern: '253 broadway', coords: { lat: 40.7131, lng: -74.0069 } },
  { pattern: '125 worth', coords: { lat: 40.7155, lng: -74.0028 } },
  { pattern: '150 william', coords: { lat: 40.7097, lng: -74.0063 } },
  { pattern: '250 broadway', coords: { lat: 40.7133, lng: -74.0069 } },
  { pattern: '80 maiden', coords: { lat: 40.7067, lng: -74.0075 } },
  { pattern: '59-17 junction', coords: { lat: 40.7318, lng: -73.8635 } },
  { pattern: '30-30 thomson', coords: { lat: 40.7430, lng: -73.9240 } },
  { pattern: '120 broadway', coords: { lat: 40.7089, lng: -74.0108 } },
  { pattern: '1 metrotech', coords: { lat: 40.6944, lng: -73.9857 } },
  { pattern: '210 joralemon', coords: { lat: 40.6920, lng: -73.9909 } },
  { pattern: '350 jay', coords: { lat: 40.6930, lng: -73.9870 } },
  { pattern: '42 broadway', coords: { lat: 40.7059, lng: -74.0133 } },
  { pattern: '31 chambers', coords: { lat: 40.7141, lng: -74.0057 } },
  { pattern: '22 reade', coords: { lat: 40.7144, lng: -74.0047 } },
  { pattern: '33 beaver', coords: { lat: 40.7045, lng: -74.0127 } },
  { pattern: '40 rector', coords: { lat: 40.7072, lng: -74.0136 } },
  { pattern: '1 fordham', coords: { lat: 40.8615, lng: -73.8888 } },
  { pattern: '161 erie', coords: { lat: 40.7310, lng: -73.8563 } },
];

// Borough keywords for fuzzy matching against address strings
const BOROUGH_KEYWORDS = [
  { keyword: 'manhattan', lat: 40.7831, lng: -73.9712 },
  { keyword: 'brooklyn', lat: 40.6782, lng: -73.9442 },
  { keyword: 'queens', lat: 40.7282, lng: -73.7949 },
  { keyword: 'bronx', lat: 40.8448, lng: -73.8648 },
  { keyword: 'staten island', lat: 40.5795, lng: -74.1502 },
  { keyword: 'new york', lat: 40.7128, lng: -74.0060 },
  { keyword: 'n.y.', lat: 40.7128, lng: -74.0060 },
];

// Default NYC center for jobs that can't be precisely located
const NYC_DEFAULT = { lat: 40.7128, lng: -74.0060 };

/**
 * Add small random jitter to coordinates so markers at the same location
 * don't stack on top of each other (±~500m).
 */
const addJitter = (coords) => ({
  lat: coords.lat + (Math.random() - 0.5) * 0.01,
  lng: coords.lng + (Math.random() - 0.5) * 0.01,
});

/**
 * Geocode a job's location using static lookup (no jitter).
 * Use this for storing coordinates in the database.
 * @param {string} workLocation - Primary location (e.g., "Manhattan")
 * @param {string} [workLocation1] - Secondary address (e.g., "100 Church St., New York, NY")
 * @param {string} [source] - Job source ('nyc', 'federal') — NYC jobs default to NYC center
 * @returns {{ lat: number, lng: number } | null}
 */
const geocodeLocationBase = (workLocation, workLocation1, source) => {
  // Try exact match on workLocation
  if (workLocation) {
    const key = workLocation.toLowerCase().trim();
    if (LOCATION_COORDS[key]) {
      return { ...LOCATION_COORDS[key] };
    }
  }

  // Try exact match on workLocation1
  if (workLocation1) {
    const key1 = workLocation1.toLowerCase().trim();
    if (LOCATION_COORDS[key1]) {
      return { ...LOCATION_COORDS[key1] };
    }
  }

  // Try address pattern matching (common NYC government buildings)
  const combined = `${workLocation || ''} ${workLocation1 || ''}`.toLowerCase();
  for (const { pattern, coords } of ADDRESS_COORDS) {
    if (combined.includes(pattern)) {
      return { ...coords };
    }
  }

  // Try fuzzy matching — look for borough keywords in either location field
  for (const { keyword, lat, lng } of BOROUGH_KEYWORDS) {
    if (combined.includes(keyword)) {
      return { lat, lng };
    }
  }

  // For NYC-source jobs, default to NYC center rather than dropping them
  if (source === 'nyc') {
    return { ...NYC_DEFAULT };
  }

  return null;
};

module.exports = { geocodeLocationBase };
