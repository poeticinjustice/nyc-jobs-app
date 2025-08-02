import React from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { HiSearch, HiBookmark, HiDocumentText, HiUser } from 'react-icons/hi';

const Home = () => {
  const { isAuthenticated, user } = useSelector((state) => state.auth);

  const quickActions = [
    {
      name: 'Search Jobs',
      description: 'Find your next opportunity in NYC government',
      icon: HiSearch,
      href: '/search',
      color: 'bg-blue-500',
      requiresAuth: false,
    },
    {
      name: 'Saved Jobs',
      description: 'View your saved job listings',
      icon: HiBookmark,
      href: '/saved',
      color: 'bg-green-500',
      requiresAuth: true,
    },
    {
      name: 'My Notes',
      description: 'Manage your job application notes',
      icon: HiDocumentText,
      href: '/notes',
      color: 'bg-purple-500',
      requiresAuth: true,
    },
    {
      name: 'Profile',
      description: 'Update your account information',
      icon: HiUser,
      href: '/profile',
      color: 'bg-orange-500',
      requiresAuth: true,
    },
  ];

  return (
    <div className='space-y-8'>
      {/* Hero Section */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-8'>
        <div className='text-center'>
          <h1 className='text-4xl font-bold text-gray-900 mb-4'>
            Welcome to NYC Jobs
          </h1>
          <p className='text-xl text-gray-600 mb-8'>
            Discover and manage job opportunities in New York City government
          </p>

          {isAuthenticated ? (
            <div className='space-y-4'>
              <p className='text-lg text-gray-700'>
                Welcome back, {user?.firstName}! Ready to find your next
                opportunity?
              </p>
              <Link
                to='/search'
                className='inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700'
              >
                <HiSearch className='mr-2 h-5 w-5' />
                Start Searching
              </Link>
            </div>
          ) : (
            <div className='space-y-4'>
              <p className='text-lg text-gray-700'>
                Create an account to save jobs and manage your applications
              </p>
              <div className='flex justify-center space-x-4'>
                <Link
                  to='/register'
                  className='inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700'
                >
                  Get Started
                </Link>
                <Link
                  to='/search'
                  className='inline-flex items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50'
                >
                  Browse Jobs
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
        {quickActions.map((action) => {
          // Skip actions that require auth but user is not authenticated
          if (action.requiresAuth && !isAuthenticated) return null;

          const Icon = action.icon;

          return (
            <Link
              key={action.name}
              to={action.href}
              className='group bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200'
            >
              <div className='flex items-center'>
                <div className={`${action.color} rounded-lg p-3 mr-4`}>
                  <Icon className='h-6 w-6 text-white' />
                </div>
                <div>
                  <h3 className='text-lg font-medium text-gray-900 group-hover:text-primary-600'>
                    {action.name}
                  </h3>
                  <p className='text-sm text-gray-500'>{action.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Features Section */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-8'>
        <h2 className='text-2xl font-bold text-gray-900 mb-6'>Why NYC Jobs?</h2>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-8'>
          <div className='text-center'>
            <div className='bg-blue-100 rounded-lg p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center'>
              <HiSearch className='h-8 w-8 text-blue-600' />
            </div>
            <h3 className='text-lg font-medium text-gray-900 mb-2'>
              Comprehensive Search
            </h3>
            <p className='text-gray-600'>
              Search through thousands of NYC government job postings with
              advanced filters
            </p>
          </div>

          <div className='text-center'>
            <div className='bg-green-100 rounded-lg p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center'>
              <HiBookmark className='h-8 w-8 text-green-600' />
            </div>
            <h3 className='text-lg font-medium text-gray-900 mb-2'>
              Save & Track
            </h3>
            <p className='text-gray-600'>
              Save interesting jobs and track your application progress
            </p>
          </div>

          <div className='text-center'>
            <div className='bg-purple-100 rounded-lg p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center'>
              <HiDocumentText className='h-8 w-8 text-purple-600' />
            </div>
            <h3 className='text-lg font-medium text-gray-900 mb-2'>
              Notes & Organization
            </h3>
            <p className='text-gray-600'>
              Create notes for each job application to stay organized
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
