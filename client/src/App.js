import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { getProfile } from './store/slices/authSlice';
import { getJobCategories } from './store/slices/jobsSlice';
import Layout from './components/Layout/Layout';
import Home from './pages/Home';
import JobSearch from './pages/JobSearch';
import JobDetails from './pages/JobDetails';
import SavedJobs from './pages/SavedJobs';
import Notes from './pages/Notes';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Register from './pages/Register';
import Admin from './pages/Admin';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import AdminRoute from './components/Auth/AdminRoute';
import LoadingSpinner from './components/UI/LoadingSpinner';

function App() {
  const dispatch = useDispatch();
  const { isAuthenticated, loading, token } = useSelector(
    (state) => state.auth
  );
  const { categories } = useSelector((state) => state.jobs);

  useEffect(() => {
    // Check if user is authenticated on app load
    if (token && !isAuthenticated) {
      dispatch(getProfile());
    }
  }, [dispatch, token, isAuthenticated]);

  useEffect(() => {
    // Load job categories on app start
    if (categories.length === 0) {
      dispatch(getJobCategories());
    }
  }, [dispatch, categories.length]);

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <LoadingSpinner size='lg' />
      </div>
    );
  }

  return (
    <div className='App'>
      <Routes>
        {/* Public routes */}
        <Route
          path='/login'
          element={isAuthenticated ? <Navigate to='/' replace /> : <Login />}
        />
        <Route
          path='/register'
          element={isAuthenticated ? <Navigate to='/' replace /> : <Register />}
        />

        {/* Protected routes */}
        <Route
          path='/'
          element={
            <Layout>
              <Home />
            </Layout>
          }
        />

        <Route
          path='/search'
          element={
            <Layout>
              <JobSearch />
            </Layout>
          }
        />

        <Route
          path='/job/:jobId'
          element={
            <Layout>
              <JobDetails />
            </Layout>
          }
        />

        <Route
          path='/saved'
          element={
            <ProtectedRoute>
              <Layout>
                <SavedJobs />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path='/notes'
          element={
            <ProtectedRoute>
              <Layout>
                <Notes />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path='/profile'
          element={
            <ProtectedRoute>
              <Layout>
                <Profile />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path='/admin'
          element={
            <AdminRoute>
              <Layout>
                <Admin />
              </Layout>
            </AdminRoute>
          }
        />

        {/* Catch all route */}
        <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
    </div>
  );
}

export default App;
