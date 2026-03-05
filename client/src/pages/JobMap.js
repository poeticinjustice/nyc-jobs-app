import React, { useState, useEffect, useCallback, useRef } from 'react';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl';
import { Link } from 'react-router-dom';
import { HiLocationMarker, HiFilter, HiX } from 'react-icons/hi';
import api from '../utils/api';
import { formatSalary } from '../utils/formatUtils';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import SourceBadge from '../components/UI/SourceBadge';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

const SOURCE_TABS = [
  { value: 'all', label: 'All Jobs' },
  { value: 'nyc', label: 'NYC' },
  { value: 'federal', label: 'Federal' },
];

// Cluster layer — sized circles by point count
const clusterLayer = {
  id: 'clusters',
  type: 'circle',
  source: 'jobs',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': [
      'step', ['get', 'point_count'],
      '#93c5fd', // < 50: light blue
      50, '#3b82f6', // 50-200: blue
      200, '#1d4ed8', // 200+: dark blue
    ],
    'circle-radius': [
      'step', ['get', 'point_count'],
      20, // < 50
      50, 28, // 50-200
      200, 36, // 200+
    ],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#fff',
    'circle-opacity': 0.85,
  },
};

// Cluster count label
const clusterCountLayer = {
  id: 'cluster-count',
  type: 'symbol',
  source: 'jobs',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 13,
  },
  paint: {
    'text-color': '#ffffff',
  },
};

// Individual unclustered markers
const unclusteredPointLayer = {
  id: 'unclustered-point',
  type: 'circle',
  source: 'jobs',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': [
      'match', ['get', 'source'],
      'federal', '#10b981', // green for federal
      '#3b82f6', // blue for NYC (default)
    ],
    'circle-radius': 7,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#fff',
  },
};

const JobMap = () => {
  const mapRef = useRef(null);
  const [geojson, setGeojson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [popup, setPopup] = useState(null);
  const [source, setSource] = useState('all');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [metadata, setMetadata] = useState(null);

  // Fetch categories for filter dropdown
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get('/api/jobs/categories');
        setCategories(res.data.categories || []);
      } catch {
        // Non-critical, ignore
      }
    };
    fetchCategories();
  }, []);

  // Fetch map data
  const fetchMapData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { source };
      if (category) params.category = category;
      const res = await api.get('/api/jobs/map', { params });
      setGeojson(res.data);
      setMetadata(res.data.metadata);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load map data');
    } finally {
      setLoading(false);
    }
  }, [source, category]);

  useEffect(() => {
    fetchMapData();
  }, [fetchMapData]);

  // Handle click on cluster — zoom in to expand
  const handleClusterClick = useCallback((e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const clusterId = feature.properties.cluster_id;
    const mapSource = map.getSource('jobs');
    mapSource.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({
        center: feature.geometry.coordinates,
        zoom: zoom + 0.5,
        duration: 500,
      });
    });
  }, []);

  // Handle click on individual marker — show popup
  const handlePointClick = useCallback((e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const [lng, lat] = feature.geometry.coordinates;
    setPopup({ lng, lat, properties: feature.properties });
  }, []);

  const handleMapClick = useCallback((e) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Check clusters first, then individual points
    const clusterFeatures = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    if (clusterFeatures.length > 0) {
      handleClusterClick({ features: clusterFeatures });
      return;
    }

    const pointFeatures = map.queryRenderedFeatures(e.point, { layers: ['unclustered-point'] });
    if (pointFeatures.length > 0) {
      handlePointClick({ features: pointFeatures });
      return;
    }

    // Click on empty map area — close popup
    setPopup(null);
  }, [handleClusterClick, handlePointClick]);

  // Change cursor on hover
  const handleMouseEnter = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = 'pointer';
  }, []);

  const handleMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = '';
  }, []);

  // No token placeholder
  if (!MAPBOX_TOKEN) {
    return (
      <div className='flex items-center justify-center' style={{ height: 'calc(100vh - 64px)' }}>
        <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-md text-center'>
          <HiLocationMarker className='h-16 w-16 text-gray-300 mx-auto mb-4' />
          <h2 className='text-xl font-bold text-gray-900 mb-2'>Map Not Configured</h2>
          <p className='text-gray-600 mb-4'>
            A Mapbox access token is required to display the job map.
          </p>
          <div className='bg-gray-50 rounded-lg p-4 text-left text-sm text-gray-700'>
            <p className='font-medium mb-2'>Setup:</p>
            <ol className='list-decimal list-inside space-y-1'>
              <li>Get a free token at <span className='font-mono text-primary-600'>mapbox.com</span></li>
              <li>Add to your <span className='font-mono'>.env</span> file:</li>
            </ol>
            <code className='block mt-2 bg-gray-100 p-2 rounded text-xs'>
              REACT_APP_MAPBOX_TOKEN=pk.your_token
            </code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='relative' style={{ height: 'calc(100vh - 64px)' }}>
      {/* Filter bar */}
      <div className='absolute top-4 left-4 right-4 z-10 flex items-start gap-3'>
        {/* Source tabs */}
        <div className='bg-white rounded-lg shadow-lg border border-gray-200 p-1 flex'>
          {SOURCE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSource(tab.value)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                source === tab.value
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`bg-white rounded-lg shadow-lg border border-gray-200 p-2.5 transition-colors ${
            showFilters || category ? 'text-primary-600' : 'text-gray-600 hover:text-gray-900'
          }`}
          title='Filters'
        >
          <HiFilter className='h-5 w-5' />
        </button>

        {/* Category filter dropdown */}
        {showFilters && (
          <div className='bg-white rounded-lg shadow-lg border border-gray-200 p-3 flex items-center gap-2'>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className='text-sm border border-gray-300 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 max-w-[250px]'
            >
              <option value=''>All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {category && (
              <button
                onClick={() => setCategory('')}
                className='text-gray-400 hover:text-gray-600'
              >
                <HiX className='h-4 w-4' />
              </button>
            )}
          </div>
        )}

        {/* Stats badge */}
        {metadata && !loading && (
          <div className='bg-white rounded-lg shadow-lg border border-gray-200 px-3 py-2 ml-auto hidden md:block'>
            <span className='text-sm text-gray-600'>
              <span className='font-semibold text-gray-900'>{metadata.geocoded.toLocaleString()}</span> jobs on map
            </span>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className='absolute inset-0 z-20 bg-white/60 flex items-center justify-center'>
          <div className='bg-white rounded-lg shadow-lg p-6 flex items-center gap-3'>
            <LoadingSpinner size='md' />
            <span className='text-gray-700 font-medium'>Loading job locations...</span>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className='absolute top-20 left-1/2 -translate-x-1/2 z-20'>
          <div className='bg-red-50 border border-red-200 rounded-lg px-4 py-3'>
            <p className='text-red-800 text-sm'>{error}</p>
          </div>
        </div>
      )}

      {/* Map */}
      <Map
        ref={mapRef}
        initialViewState={{
          latitude: 40.7128,
          longitude: -74.006,
          zoom: 11,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle='mapbox://styles/mapbox/light-v11'
        mapboxAccessToken={MAPBOX_TOKEN}
        onClick={handleMapClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={['clusters', 'unclustered-point']}
      >
        <NavigationControl position='bottom-right' />

        {geojson && (
          <Source
            id='jobs'
            type='geojson'
            data={geojson}
            cluster={true}
            clusterMaxZoom={14}
            clusterRadius={50}
          >
            <Layer {...clusterLayer} />
            <Layer {...clusterCountLayer} />
            <Layer {...unclusteredPointLayer} />
          </Source>
        )}

        {popup && (
          <Popup
            latitude={popup.lat}
            longitude={popup.lng}
            onClose={() => setPopup(null)}
            closeOnClick={false}
            offset={12}
            maxWidth='320px'
          >
            <div className='p-1'>
              <div className='flex items-center gap-2 mb-1'>
                <h3 className='text-sm font-semibold text-gray-900 leading-tight'>
                  {popup.properties.businessTitle}
                </h3>
                <SourceBadge source={popup.properties.source} />
              </div>
              <p className='text-xs text-gray-600 mb-1'>{popup.properties.agency}</p>
              <p className='text-xs text-gray-500 mb-1'>
                {popup.properties.workLocation}
              </p>
              <p className='text-xs font-medium text-gray-700 mb-2'>
                {formatSalary(
                  popup.properties.salaryRangeFrom,
                  popup.properties.salaryRangeTo,
                  popup.properties.salaryFrequency
                )}
              </p>
              <Link
                to={`/job/${popup.properties.jobId}?source=${popup.properties.source || 'nyc'}`}
                className='text-xs text-primary-600 hover:text-primary-700 font-medium'
              >
                View Details →
              </Link>
            </div>
          </Popup>
        )}
      </Map>

      {/* Legend */}
      <div className='absolute bottom-8 left-4 bg-white rounded-lg shadow-lg border border-gray-200 px-3 py-2 hidden md:block'>
        <div className='flex items-center gap-4 text-xs text-gray-600'>
          <div className='flex items-center gap-1.5'>
            <span className='w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm' />
            NYC Jobs
          </div>
          <div className='flex items-center gap-1.5'>
            <span className='w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-sm' />
            Federal Jobs
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobMap;
