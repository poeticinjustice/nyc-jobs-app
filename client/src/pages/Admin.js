import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  HiUsers,
  HiBriefcase,
  HiDocumentText,
  HiChartBar,
} from 'react-icons/hi';
import LoadingSpinner from '../components/UI/LoadingSpinner';

const Admin = () => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalJobs: 0,
    totalNotes: 0,
    activeUsers: 0,
  });

  useEffect(() => {
    // Fetch admin statistics
    // This would dispatch actions to get admin data
    console.log('Admin page loaded');
  }, [dispatch]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <h1 className='text-2xl font-bold text-gray-900'>Admin Dashboard</h1>
        <p className='text-gray-600 mt-1'>
          Manage users, jobs, and system settings
        </p>
      </div>

      {/* Admin Content */}
      <div className='grid grid-cols-1 lg:grid-cols-4 gap-6'>
        {/* Sidebar */}
        <div className='lg:col-span-1'>
          <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
            <nav className='space-y-2'>
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'dashboard'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <HiChartBar className='inline h-4 w-4 mr-2' />
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'users'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <HiUsers className='inline h-4 w-4 mr-2' />
                User Management
              </button>
              <button
                onClick={() => setActiveTab('jobs')}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'jobs'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <HiBriefcase className='inline h-4 w-4 mr-2' />
                Job Management
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'notes'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <HiDocumentText className='inline h-4 w-4 mr-2' />
                Notes Management
              </button>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className='lg:col-span-3'>
          {activeTab === 'dashboard' && (
            <div className='space-y-6'>
              {/* Stats Cards */}
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
                <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                  <div className='flex items-center'>
                    <div className='flex-shrink-0'>
                      <HiUsers className='h-8 w-8 text-primary-600' />
                    </div>
                    <div className='ml-4'>
                      <p className='text-sm font-medium text-gray-500'>
                        Total Users
                      </p>
                      <p className='text-2xl font-semibold text-gray-900'>
                        {stats.totalUsers}
                      </p>
                    </div>
                  </div>
                </div>

                <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                  <div className='flex items-center'>
                    <div className='flex-shrink-0'>
                      <HiBriefcase className='h-8 w-8 text-green-600' />
                    </div>
                    <div className='ml-4'>
                      <p className='text-sm font-medium text-gray-500'>
                        Total Jobs
                      </p>
                      <p className='text-2xl font-semibold text-gray-900'>
                        {stats.totalJobs}
                      </p>
                    </div>
                  </div>
                </div>

                <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                  <div className='flex items-center'>
                    <div className='flex-shrink-0'>
                      <HiDocumentText className='h-8 w-8 text-blue-600' />
                    </div>
                    <div className='ml-4'>
                      <p className='text-sm font-medium text-gray-500'>
                        Total Notes
                      </p>
                      <p className='text-2xl font-semibold text-gray-900'>
                        {stats.totalNotes}
                      </p>
                    </div>
                  </div>
                </div>

                <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                  <div className='flex items-center'>
                    <div className='flex-shrink-0'>
                      <HiUsers className='h-8 w-8 text-orange-600' />
                    </div>
                    <div className='ml-4'>
                      <p className='text-sm font-medium text-gray-500'>
                        Active Users
                      </p>
                      <p className='text-2xl font-semibold text-gray-900'>
                        {stats.activeUsers}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                <h3 className='text-lg font-semibold text-gray-900 mb-4'>
                  Recent Activity
                </h3>
                <div className='space-y-4'>
                  <div className='flex items-center space-x-4'>
                    <div className='w-2 h-2 bg-green-400 rounded-full'></div>
                    <div className='flex-1'>
                      <p className='text-sm text-gray-900'>
                        New user registration
                      </p>
                      <p className='text-xs text-gray-500'>2 minutes ago</p>
                    </div>
                  </div>
                  <div className='flex items-center space-x-4'>
                    <div className='w-2 h-2 bg-blue-400 rounded-full'></div>
                    <div className='flex-1'>
                      <p className='text-sm text-gray-900'>Job saved by user</p>
                      <p className='text-xs text-gray-500'>5 minutes ago</p>
                    </div>
                  </div>
                  <div className='flex items-center space-x-4'>
                    <div className='w-2 h-2 bg-orange-400 rounded-full'></div>
                    <div className='flex-1'>
                      <p className='text-sm text-gray-900'>Note created</p>
                      <p className='text-xs text-gray-500'>10 minutes ago</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h2 className='text-xl font-semibold text-gray-900 mb-6'>
                User Management
              </h2>
              <div className='text-center py-8'>
                <HiUsers className='h-12 w-12 text-gray-400 mx-auto mb-4' />
                <p className='text-gray-500'>
                  User management features coming soon...
                </p>
              </div>
            </div>
          )}

          {activeTab === 'jobs' && (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h2 className='text-xl font-semibold text-gray-900 mb-6'>
                Job Management
              </h2>
              <div className='text-center py-8'>
                <HiBriefcase className='h-12 w-12 text-gray-400 mx-auto mb-4' />
                <p className='text-gray-500'>
                  Job management features coming soon...
                </p>
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h2 className='text-xl font-semibold text-gray-900 mb-6'>
                Notes Management
              </h2>
              <div className='text-center py-8'>
                <HiDocumentText className='h-12 w-12 text-gray-400 mx-auto mb-4' />
                <p className='text-gray-500'>
                  Notes management features coming soon...
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* System Information */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <h2 className='text-xl font-semibold text-gray-900 mb-6'>
          System Information
        </h2>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div>
            <span className='text-sm font-medium text-gray-500'>
              Current User
            </span>
            <p className='text-gray-900'>
              {user?.firstName} {user?.lastName} ({user?.email})
            </p>
          </div>
          <div>
            <span className='text-sm font-medium text-gray-500'>User Role</span>
            <p className='text-gray-900 capitalize'>{user?.role || 'user'}</p>
          </div>
          <div>
            <span className='text-sm font-medium text-gray-500'>
              Last Login
            </span>
            <p className='text-gray-900'>{formatDate(user?.lastLogin)}</p>
          </div>
          <div>
            <span className='text-sm font-medium text-gray-500'>
              Account Status
            </span>
            <p className='text-gray-900'>
              <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800'>
                Active
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;
