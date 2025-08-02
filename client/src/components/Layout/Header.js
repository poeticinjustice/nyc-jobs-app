import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { HiMenu, HiUser, HiLogout, HiCog, HiBell } from 'react-icons/hi';

const Header = ({ onMenuToggle, onLogout, user, isAuthenticated }) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const toggleUserMenu = () => {
    setUserMenuOpen(!userMenuOpen);
  };

  return (
    <header className='bg-white shadow-sm border-b border-gray-200'>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        <div className='flex justify-between items-center h-16'>
          {/* Left side */}
          <div className='flex items-center'>
            <button
              type='button'
              className='md:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500'
              onClick={onMenuToggle}
            >
              <HiMenu className='h-6 w-6' />
            </button>

            <div className='flex-shrink-0 flex items-center'>
              <Link to='/' className='flex items-center'>
                <div className='w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center'>
                  <span className='text-white font-bold text-sm'>NYC</span>
                </div>
                <span className='ml-2 text-xl font-semibold text-gray-900'>
                  Jobs
                </span>
              </Link>
            </div>
          </div>

          {/* Right side */}
          <div className='flex items-center space-x-4'>
            {/* Notifications */}
            <button className='p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-md'>
              <HiBell className='h-5 w-5' />
            </button>

            {/* User menu */}
            {isAuthenticated ? (
              <div className='relative'>
                <button
                  type='button'
                  className='flex items-center space-x-2 p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-md'
                  onClick={toggleUserMenu}
                >
                  <div className='w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center'>
                    <span className='text-white text-sm font-medium'>
                      {user?.firstName?.charAt(0) || 'U'}
                    </span>
                  </div>
                  <span className='hidden md:block text-sm font-medium text-gray-700'>
                    {user?.firstName} {user?.lastName}
                  </span>
                </button>

                {userMenuOpen && (
                  <div className='absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50'>
                    <Link
                      to='/profile'
                      className='flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100'
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <HiUser className='mr-3 h-4 w-4' />
                      Profile
                    </Link>
                    <Link
                      to='/saved'
                      className='flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100'
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <HiCog className='mr-3 h-4 w-4' />
                      Saved Jobs
                    </Link>
                    {user?.role === 'admin' && (
                      <Link
                        to='/admin'
                        className='flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100'
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <HiCog className='mr-3 h-4 w-4' />
                        Admin
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        onLogout();
                        setUserMenuOpen(false);
                      }}
                      className='flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100'
                    >
                      <HiLogout className='mr-3 h-4 w-4' />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className='flex items-center space-x-2'>
                <Link
                  to='/login'
                  className='text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium'
                >
                  Login
                </Link>
                <Link
                  to='/register'
                  className='bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700'
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
