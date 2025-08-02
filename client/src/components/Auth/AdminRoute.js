import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

const AdminRoute = ({ children }) => {
  const { user } = useSelector((state) => state.auth);

  return (
    <ProtectedRoute>
      {user && (user.role === 'admin' || user.role === 'moderator') ? (
        children
      ) : (
        <Navigate to='/' replace />
      )}
    </ProtectedRoute>
  );
};

export default AdminRoute;
