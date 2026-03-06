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

// NY State county seats / centers (for NYS job locations)
const NY_COUNTY_COORDS = {
  'albany': { lat: 42.6526, lng: -73.7562 },
  'allegany': { lat: 42.2538, lng: -78.0268 },
  'broome': { lat: 42.0987, lng: -75.9180 },
  'cattaraugus': { lat: 42.2495, lng: -78.6095 },
  'cayuga': { lat: 42.9318, lng: -76.5660 },
  'chautauqua': { lat: 42.1410, lng: -79.2353 },
  'chemung': { lat: 42.0898, lng: -76.8077 },
  'chenango': { lat: 42.4977, lng: -75.6352 },
  'clinton': { lat: 44.6935, lng: -73.4580 },
  'columbia': { lat: 42.2469, lng: -73.7621 },
  'cortland': { lat: 42.6011, lng: -76.1808 },
  'delaware': { lat: 42.1982, lng: -74.9669 },
  'dutchess': { lat: 41.7004, lng: -73.8963 },
  'erie': { lat: 42.8864, lng: -78.8784 },
  'essex': { lat: 44.1167, lng: -73.7337 },
  'franklin': { lat: 44.5926, lng: -74.1555 },
  'fulton': { lat: 43.1153, lng: -74.3741 },
  'genesee': { lat: 43.0042, lng: -78.1893 },
  'greene': { lat: 42.2563, lng: -74.1310 },
  'hamilton': { lat: 43.6593, lng: -74.4971 },
  'herkimer': { lat: 43.0257, lng: -74.9848 },
  'jefferson': { lat: 44.0019, lng: -75.8994 },
  'kings': { lat: 40.6782, lng: -73.9442 },
  'lewis': { lat: 43.7846, lng: -75.4493 },
  'livingston': { lat: 42.7967, lng: -77.7822 },
  'madison': { lat: 42.9133, lng: -75.6605 },
  'monroe': { lat: 43.1566, lng: -77.6088 },
  'montgomery': { lat: 42.9415, lng: -74.1763 },
  'nassau': { lat: 40.7291, lng: -73.5893 },
  'new york': { lat: 40.7831, lng: -73.9712 },
  'niagara': { lat: 43.0962, lng: -78.8867 },
  'oneida': { lat: 43.1009, lng: -75.2327 },
  'onondaga': { lat: 43.0481, lng: -76.1474 },
  'ontario': { lat: 42.8530, lng: -77.2864 },
  'orange': { lat: 41.4018, lng: -74.3118 },
  'orleans': { lat: 43.2468, lng: -78.2254 },
  'oswego': { lat: 43.4555, lng: -76.5105 },
  'otsego': { lat: 42.4633, lng: -75.0614 },
  'putnam': { lat: 41.4270, lng: -73.7613 },
  'queens': { lat: 40.7282, lng: -73.7949 },
  'rensselaer': { lat: 42.7284, lng: -73.6918 },
  'richmond': { lat: 40.5795, lng: -74.1502 },
  'rockland': { lat: 41.1489, lng: -74.0256 },
  'saratoga': { lat: 43.0843, lng: -73.7846 },
  'schenectady': { lat: 42.8142, lng: -73.9396 },
  'schoharie': { lat: 42.6567, lng: -74.3093 },
  'schuyler': { lat: 42.3920, lng: -76.8608 },
  'seneca': { lat: 42.7814, lng: -76.8229 },
  'st. lawrence': { lat: 44.5946, lng: -75.1710 },
  'saint lawrence': { lat: 44.5946, lng: -75.1710 },
  'steuben': { lat: 42.2687, lng: -77.3869 },
  'suffolk': { lat: 40.9423, lng: -72.6832 },
  'sullivan': { lat: 41.7174, lng: -74.7691 },
  'tioga': { lat: 42.1706, lng: -76.3060 },
  'tompkins': { lat: 42.4440, lng: -76.5019 },
  'ulster': { lat: 41.8271, lng: -74.3254 },
  'warren': { lat: 43.3345, lng: -73.6840 },
  'washington': { lat: 43.3134, lng: -73.4287 },
  'wayne': { lat: 43.1399, lng: -77.0461 },
  'westchester': { lat: 41.1220, lng: -73.7949 },
  'wyoming': { lat: 42.7017, lng: -78.2334 },
  'yates': { lat: 42.6133, lng: -77.1045 },
  // NYC borough aliases for county names
  'bronx': { lat: 40.8448, lng: -73.8648 },
  'staten island': { lat: 40.5795, lng: -74.1502 },
};

// Default centers per source
const NYC_DEFAULT = { lat: 40.7128, lng: -74.0060 };
const NYS_DEFAULT = { lat: 42.6526, lng: -73.7562 }; // Albany

/**
 * Geocode a job's location using static lookup (no jitter).
 * Use this for storing coordinates in the database.
 * @param {string} workLocation - Primary location (e.g., "Manhattan")
 * @param {string} [workLocation1] - Secondary address (e.g., "100 Church St., New York, NY")
 * @param {string} [source] - Job source ('nyc', 'federal', 'nys') — NYC/NYS jobs default to center
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

  // For NYS jobs, try county lookup
  if (source === 'nys') {
    const countyKey = (workLocation || '').toLowerCase().trim();
    if (NY_COUNTY_COORDS[countyKey]) {
      return { ...NY_COUNTY_COORDS[countyKey] };
    }
    // Try county name in the combined string
    for (const [county, coords] of Object.entries(NY_COUNTY_COORDS)) {
      if (combined.includes(county)) {
        return { ...coords };
      }
    }
    return { ...NYS_DEFAULT };
  }

  // For NYC-source jobs, default to NYC center rather than dropping them
  if (source === 'nyc') {
    return { ...NYC_DEFAULT };
  }

  return null;
};

module.exports = { geocodeLocationBase };
