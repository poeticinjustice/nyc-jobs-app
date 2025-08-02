import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  HiHome,
  HiSearch,
  HiBookmark,
  HiDocumentText,
  HiUser,
  HiCog,
  HiChartBar,
} from 'react-icons/hi';

const Sidebar = ({
  isOpen,
  activeTab,
  onTabChange,
  user,
  isAuthenticated,
  isMobile = false,
}) => {
  const location = useLocation();

  const navigation = [
    { name: 'Home', href: '/', icon: HiHome, requiresAuth: false },
    {
      name: 'Search Jobs',
      href: '/search',
      icon: HiSearch,
      requiresAuth: false,
    },
    {
      name: 'Saved Jobs',
      href: '/saved',
      icon: HiBookmark,
      requiresAuth: true,
    },
    { name: 'Notes', href: '/notes', icon: HiDocumentText, requiresAuth: true },
    { name: 'Profile', href: '/profile', icon: HiUser, requiresAuth: true },
    {
      name: 'Admin',
      href: '/admin',
      icon: HiCog,
      requiresAuth: true,
      requiresAdmin: true,
    },
  ];

  const isCurrentPath = (href) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  return (
    <div
      className={`${
        isMobile ? 'w-full' : 'w-64'
      } bg-white shadow-sm border-r border-gray-200 flex flex-col`}
    >
      {/* User info */}
      {isAuthenticated && (
        <div className='p-4 border-b border-gray-200'>
          <div className='flex items-center'>
            <div className='w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center'>
              <span className='text-white text-sm font-medium'>
                {user?.firstName?.charAt(0) || 'U'}
              </span>
            </div>
            <div className='ml-3'>
              <p className='text-sm font-medium text-gray-900'>
                {user?.firstName} {user?.lastName}
              </p>
              <p className='text-xs text-gray-500 capitalize'>
                {user?.role || 'user'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className='flex-1 px-2 py-4 space-y-1'>
        {navigation.map((item) => {
          // Skip items that require auth but user is not authenticated
          if (item.requiresAuth && !isAuthenticated) return null;

          // Skip admin items if user is not admin
          if (item.requiresAdmin && user?.role !== 'admin') return null;

          const Icon = item.icon;
          const isActive = isCurrentPath(item.href);

          return (
            <Link
              key={item.name}
              to={item.href}
              className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? 'bg-primary-100 text-primary-900 border-r-2 border-primary-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
              onClick={() =>
                onTabChange &&
                onTabChange(item.name.toLowerCase().replace(' ', ''))
              }
            >
              <Icon
                className={`mr-3 h-5 w-5 ${
                  isActive
                    ? 'text-primary-500'
                    : 'text-gray-400 group-hover:text-gray-500'
                }`}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className='p-4 border-t border-gray-200'>
        <div className='text-xs text-gray-500'>
          <p>NYC Jobs App</p>
          <p>Version 1.0.0</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
