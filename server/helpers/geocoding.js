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

  // Common work addresses / landmarks
  'city hall': { lat: 40.7128, lng: -74.0060 },
  'world trade center': { lat: 40.7127, lng: -74.0134 },

  // Federal job locations
  'new york, new york': { lat: 40.7128, lng: -74.0060 },
  'new york, ny': { lat: 40.7128, lng: -74.0060 },
  'new york': { lat: 40.7128, lng: -74.0060 },
  'nyc': { lat: 40.7128, lng: -74.0060 },
};

// Borough keywords for fuzzy matching against address strings
const BOROUGH_KEYWORDS = [
  { keyword: 'manhattan', lat: 40.7831, lng: -73.9712 },
  { keyword: 'brooklyn', lat: 40.6782, lng: -73.9442 },
  { keyword: 'queens', lat: 40.7282, lng: -73.7949 },
  { keyword: 'bronx', lat: 40.8448, lng: -73.8648 },
  { keyword: 'staten island', lat: 40.5795, lng: -74.1502 },
  { keyword: 'new york', lat: 40.7128, lng: -74.0060 },
];

/**
 * Add small random jitter to coordinates so markers at the same location
 * don't stack on top of each other (±~500m).
 */
const addJitter = (coords) => ({
  lat: coords.lat + (Math.random() - 0.5) * 0.01,
  lng: coords.lng + (Math.random() - 0.5) * 0.01,
});

/**
 * Geocode a job's location using static lookup.
 * @param {string} workLocation - Primary location (e.g., "Manhattan")
 * @param {string} [workLocation1] - Secondary address (e.g., "100 Church St., New York, NY")
 * @returns {{ lat: number, lng: number } | null}
 */
const geocodeLocation = (workLocation, workLocation1) => {
  // Try exact match on workLocation
  if (workLocation) {
    const key = workLocation.toLowerCase().trim();
    if (LOCATION_COORDS[key]) {
      return addJitter(LOCATION_COORDS[key]);
    }
  }

  // Try exact match on workLocation1
  if (workLocation1) {
    const key1 = workLocation1.toLowerCase().trim();
    if (LOCATION_COORDS[key1]) {
      return addJitter(LOCATION_COORDS[key1]);
    }
  }

  // Try fuzzy matching — look for borough keywords in either location field
  const combined = `${workLocation || ''} ${workLocation1 || ''}`.toLowerCase();
  for (const { keyword, lat, lng } of BOROUGH_KEYWORDS) {
    if (combined.includes(keyword)) {
      return addJitter({ lat, lng });
    }
  }

  return null;
};

module.exports = { geocodeLocation, LOCATION_COORDS };
