import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useLocation } from 'react-router-dom';
import { logout } from '../../store/slices/authSlice';
import { toggleSidebar, setSidebarTab } from '../../store/slices/uiSlice';
import Header from './Header';
import Sidebar from './Sidebar';
import { HiMenu, HiX } from 'react-icons/hi';

const Layout = ({ children }) => {
  const dispatch = useDispatch();
  const location = useLocation();
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const { sidebar } = useSelector((state) => state.ui);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    dispatch(logout());
  };

  const handleSidebarToggle = () => {
    dispatch(toggleSidebar());
  };

  const handleMobileMenuToggle = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleTabChange = (tab) => {
    dispatch(setSidebarTab(tab));
    setMobileMenuOpen(false);
  };

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Header */}
      <Header
        onMenuToggle={handleMobileMenuToggle}
        onLogout={handleLogout}
        user={user}
        isAuthenticated={isAuthenticated}
      />

      <div className='flex'>
        {/* Sidebar - Desktop */}
        <div className='hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0'>
          <Sidebar
            isOpen={sidebar.isOpen}
            activeTab={sidebar.activeTab}
            onTabChange={handleTabChange}
            user={user}
            isAuthenticated={isAuthenticated}
          />
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className='md:hidden fixed inset-0 z-40'>
            <div
              className='fixed inset-0 bg-gray-600 bg-opacity-75'
              onClick={handleMobileMenuToggle}
            ></div>
            <div className='relative flex-1 flex flex-col max-w-xs w-full bg-white'>
              <div className='absolute top-0 right-0 -mr-12 pt-2'>
                <button
                  type='button'
                  className='ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white'
                  onClick={handleMobileMenuToggle}
                >
                  <HiX className='h-6 w-6 text-white' />
                </button>
              </div>
              <Sidebar
                isOpen={true}
                activeTab={sidebar.activeTab}
                onTabChange={handleTabChange}
                user={user}
                isAuthenticated={isAuthenticated}
                isMobile={true}
              />
            </div>
          </div>
        )}

        {/* Main content */}
        <div className='md:pl-64 flex flex-col flex-1'>
          <main className='flex-1'>
            <div className='py-6'>
              <div className='max-w-7xl mx-auto px-4 sm:px-6 md:px-8'>
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;
