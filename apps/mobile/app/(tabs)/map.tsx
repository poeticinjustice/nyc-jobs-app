import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Callout, Marker, Region } from 'react-native-maps';
import { useRouter } from 'expo-router';
import api from '@/lib/api';
import { formatSalary } from '@/lib/format';

type MapJob = {
  jobId: string;
  businessTitle: string;
  agency?: string;
  workLocation?: string;
  salaryRangeFrom?: number;
  salaryRangeTo?: number;
  salaryFrequency?: string;
  source?: string;
  latitude: number;
  longitude: number;
};

const NYC_REGION: Region = {
  latitude: 40.7128,
  longitude: -74.006,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<MapJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const router = useRouter();

  const fetchMapData = async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (q) params.keyword = q;
      const res = await api.get('/api/jobs/map', { params });
      const features = res.data?.features || [];
      const mapped: MapJob[] = features
        .filter((f: any) => f.geometry?.coordinates?.[1] && f.geometry?.coordinates?.[0])
        .map((f: any) => ({
          ...f.properties,
          latitude: f.geometry.coordinates[1],
          longitude: f.geometry.coordinates[0],
        }));
      setJobs(mapped);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load map data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMapData();
  }, []);

  const handleSearch = () => {
    void fetchMapData(keyword.trim());
  };

  return (
    <View style={styles.container}>
      <View style={[styles.searchBar, { paddingTop: insets.top + 8 }]}>
        <TextInput
          placeholder="Filter by keyword..."
          value={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={handleSearch}
          style={styles.input}
          returnKeyType="search"
          placeholderTextColor="#999"
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>Filter</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading {keyword ? 'filtered' : 'all'} jobs...</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchMapData(keyword.trim())}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && (
        <>
          <MapView style={styles.map} initialRegion={NYC_REGION} showsUserLocation>
            {jobs.map((job) => (
              <Marker
                key={`${job.source || 'nyc'}-${job.jobId}`}
                coordinate={{ latitude: job.latitude, longitude: job.longitude }}
                pinColor={job.source === 'federal' ? '#1D4ED8' : '#DC2626'}
              >
                <Callout
                  onPress={() => router.navigate({ pathname: '/job/[id]', params: { id: job.jobId, source: job.source || 'nyc' } })}
                >
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle} numberOfLines={2}>
                      {job.businessTitle}
                    </Text>
                    {!!job.agency && (
                      <Text style={styles.calloutMeta} numberOfLines={1}>{job.agency}</Text>
                    )}
                    {formatSalary(job.salaryRangeFrom, job.salaryRangeTo, job.salaryFrequency) && (
                      <Text style={styles.calloutSalary}>
                        {formatSalary(job.salaryRangeFrom, job.salaryRangeTo, job.salaryFrequency)}
                      </Text>
                    )}
                    <Text style={styles.calloutLink}>Tap for details</Text>
                  </View>
                </Callout>
              </Marker>
            ))}
          </MapView>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{jobs.length} jobs on map</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#F9FAFB',
  },
  searchButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  searchButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  map: { flex: 1 },
  loadingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: '#6B7280', fontSize: 14 },
  errorOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  errorText: { color: '#DC2626', fontSize: 14, textAlign: 'center' },
  retryButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryButtonText: { color: '#fff', fontWeight: '600' },
  countBadge: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  countText: { color: '#fff', fontSize: 13, fontWeight: '500' },
  callout: { width: 200, padding: 4 },
  calloutTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  calloutMeta: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  calloutSalary: { fontSize: 12, fontWeight: '500', color: '#059669', marginBottom: 4 },
  calloutLink: { fontSize: 11, color: '#3B82F6', fontWeight: '500' },
});
