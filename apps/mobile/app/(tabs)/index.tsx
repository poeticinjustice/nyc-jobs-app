import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = () => {
    router.push({
      pathname: '/(tabs)/search',
      params: { q: searchQuery.trim() },
    });
  };

  const handleBrowseAll = () => {
    router.push('/(tabs)/search');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top }]}
    >
      {/* Hero */}
      <LinearGradient
        colors={['#2563EB', '#1E40AF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroTitle}>Find Your Next Government Job</Text>
        <Text style={styles.heroSubtitle}>
          Search thousands of NYC city and federal government positions
        </Text>

        <View style={styles.searchRow}>
          <TextInput
            placeholder="Job title, keyword, or agency..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            style={styles.heroInput}
          />
          <TouchableOpacity style={styles.heroSearchButton} onPress={handleSearch}>
            <Text style={styles.heroSearchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleBrowseAll}>
          <Text style={styles.browseLink}>Or browse all available jobs</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Quick Links */}
      <View style={styles.quickLinks}>
        <TouchableOpacity style={styles.quickCard} onPress={handleBrowseAll}>
          <View style={[styles.quickIcon, { backgroundColor: '#DBEAFE' }]}>
            <Text style={[styles.quickIconText, { color: '#2563EB' }]}>S</Text>
          </View>
          <Text style={styles.quickCardTitle}>Browse Jobs</Text>
          <Text style={styles.quickCardDesc}>
            Search thousands of NYC and federal government postings
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickCard}
          onPress={() => router.push('/(tabs)/map')}
        >
          <View style={[styles.quickIcon, { backgroundColor: '#D1FAE5' }]}>
            <Text style={[styles.quickIconText, { color: '#059669' }]}>M</Text>
          </View>
          <Text style={styles.quickCardTitle}>Job Map</Text>
          <Text style={styles.quickCardDesc}>
            Explore jobs by location on an interactive map
          </Text>
        </TouchableOpacity>

        {!user ? (
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/register')}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#EDE9FE' }]}>
              <Text style={[styles.quickIconText, { color: '#7C3AED' }]}>T</Text>
            </View>
            <Text style={styles.quickCardTitle}>Save & Track</Text>
            <Text style={styles.quickCardDesc}>
              Create an account to save jobs and track applications
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(tabs)/search')}
          >
            <View style={[styles.quickIcon, { backgroundColor: '#EDE9FE' }]}>
              <Text style={[styles.quickIconText, { color: '#7C3AED' }]}>Hi</Text>
            </View>
            <Text style={styles.quickCardTitle}>Welcome, {user.firstName}!</Text>
            <Text style={styles.quickCardDesc}>
              Search and save jobs to track your applications
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Logout for authenticated users */}
      {user && (
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => logout()}
        >
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      )}

      {/* Auth prompt for guests */}
      {!user && (
        <View style={styles.authPrompt}>
          <Text style={styles.authPromptText}>
            Already have an account?
          </Text>
          <View style={styles.authButtons}>
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => router.push('/login')}
            >
              <Text style={styles.loginButtonText}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.registerButton}
              onPress={() => router.push('/register')}
            >
              <Text style={styles.registerButtonText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { paddingBottom: 32 },
  hero: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 28,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 20,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroSearchButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  heroSearchButtonText: {
    color: '#2563EB',
    fontWeight: '600',
    fontSize: 15,
  },
  browseLink: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    textDecorationLine: 'underline',
  },
  quickLinks: {
    padding: 16,
    gap: 12,
  },
  quickCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickIconText: {
    fontSize: 16,
    fontWeight: '700',
  },
  quickCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  quickCardDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  authPrompt: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  authPromptText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  authButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  loginButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#3B82F6',
    fontWeight: '600',
    fontSize: 15,
  },
  registerButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  logoutButton: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  logoutButtonText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 15,
  },
});
