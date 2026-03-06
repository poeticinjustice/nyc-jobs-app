import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateProfile, changePassword, clearError } from '../store/slices/authSlice';
import { HiUser, HiLockClosed } from 'react-icons/hi';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { formatDate } from '../utils/formatUtils';
import { validateEmail, validateName } from 'nyc-jobs-shared/utils/validation';
import { NAME_MAX } from 'nyc-jobs-shared/constants';

const Profile = () => {
  const dispatch = useDispatch();
  const { user, profileUpdateLoading, passwordChangeLoading, error } = useSelector((state) => state.auth);

  const [activeTab, setActiveTab] = useState('profile');
  const [successMessage, setSuccessMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [validationError, setValidationError] = useState('');
  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Sync profile form when user data changes (e.g. after successful update)
  useEffect(() => {
    if (user) {
      setProfileForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
      });
    }
  }, [user]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSuccessMessage('');
    const errors = {};
    const fnErr = validateName(profileForm.firstName, 'First name');
    if (fnErr) errors.firstName = fnErr;
    const lnErr = validateName(profileForm.lastName, 'Last name');
    if (lnErr) errors.lastName = lnErr;
    const emErr = validateEmail(profileForm.email);
    if (emErr) errors.email = emErr;
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    try {
      await dispatch(updateProfile(profileForm)).unwrap();
      setSuccessMessage('Profile updated successfully.');
    } catch {
      // Error displayed via Redux state
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSuccessMessage('');
    setFieldErrors({});
    setValidationError('');
    dispatch(clearError());
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setValidationError('New passwords do not match');
      return;
    }
    setValidationError('');
    setSuccessMessage('');
    try {
      await dispatch(
        changePassword({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        })
      ).unwrap();
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setSuccessMessage('Password changed successfully.');
    } catch {
      // Error displayed via Redux state
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (successMessage) setSuccessMessage('');
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    if (validationError) setValidationError('');
    if (error) dispatch(clearError());
    if (activeTab === 'profile') {
      setProfileForm((prev) => ({
        ...prev,
        [name]: value,
      }));
    } else {
      setPasswordForm((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const displayError = validationError || error;

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <h1 className='text-2xl font-bold text-gray-900'>Profile Settings</h1>
        <p className='text-gray-600 mt-1'>
          Manage your account information and preferences
        </p>
      </div>

      {/* Profile Content */}
      <div className='grid grid-cols-1 lg:grid-cols-4 gap-6'>
        {/* Sidebar */}
        <div className='lg:col-span-1'>
          <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
            <div className='flex items-center mb-6'>
              <div className='w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center'>
                <span className='text-white text-xl font-bold'>
                  {user?.firstName?.charAt(0) || 'U'}
                </span>
              </div>
              <div className='ml-4'>
                <h3 className='text-lg font-semibold text-gray-900'>
                  {user?.firstName} {user?.lastName}
                </h3>
                <p className='text-sm text-gray-500 capitalize'>
                  {user?.role || 'user'}
                </p>
              </div>
            </div>

            <nav className='space-y-2'>
              <button
                onClick={() => handleTabChange('profile')}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'profile'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <HiUser className='inline h-4 w-4 mr-2' />
                Profile Information
              </button>
              <button
                onClick={() => handleTabChange('password')}
                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'password'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <HiLockClosed className='inline h-4 w-4 mr-2' />
                Change Password
              </button>
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className='lg:col-span-3'>
          {activeTab === 'profile' ? (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h2 className='text-xl font-semibold text-gray-900 mb-6'>
                Profile Information
              </h2>

              {successMessage && (
                <div className='bg-green-50 border border-green-200 rounded-lg p-4 mb-6'>
                  <p className='text-green-800'>{successMessage}</p>
                </div>
              )}

              {displayError && (
                <div className='bg-red-50 border border-red-200 rounded-lg p-4 mb-6'>
                  <p className='text-red-800'>{displayError}</p>
                </div>
              )}

              <form onSubmit={handleProfileSubmit} className='space-y-6'>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      First Name
                    </label>
                    <input
                      type='text'
                      name='firstName'
                      value={profileForm.firstName}
                      onChange={handleInputChange}
                      className={`input ${fieldErrors.firstName ? 'border-red-300' : ''}`}
                      required
                      maxLength={NAME_MAX}
                    />
                    {fieldErrors.firstName && (
                      <p className='mt-1 text-sm text-red-600'>{fieldErrors.firstName}</p>
                    )}
                  </div>

                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>
                      Last Name
                    </label>
                    <input
                      type='text'
                      name='lastName'
                      value={profileForm.lastName}
                      onChange={handleInputChange}
                      className={`input ${fieldErrors.lastName ? 'border-red-300' : ''}`}
                      required
                      maxLength={NAME_MAX}
                    />
                    {fieldErrors.lastName && (
                      <p className='mt-1 text-sm text-red-600'>{fieldErrors.lastName}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Email Address
                  </label>
                  <input
                    type='email'
                    name='email'
                    value={profileForm.email}
                    onChange={handleInputChange}
                    className={`input ${fieldErrors.email ? 'border-red-300' : ''}`}
                    required
                  />
                  {fieldErrors.email && (
                    <p className='mt-1 text-sm text-red-600'>{fieldErrors.email}</p>
                  )}
                </div>

                <div className='flex justify-end'>
                  <button
                    type='submit'
                    disabled={profileUpdateLoading}
                    className='btn btn-primary'
                  >
                    {profileUpdateLoading ? <LoadingSpinner size='sm' /> : 'Update Profile'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h2 className='text-xl font-semibold text-gray-900 mb-6'>
                Change Password
              </h2>

              {successMessage && (
                <div className='bg-green-50 border border-green-200 rounded-lg p-4 mb-6'>
                  <p className='text-green-800'>{successMessage}</p>
                </div>
              )}

              {displayError && (
                <div className='bg-red-50 border border-red-200 rounded-lg p-4 mb-6'>
                  <p className='text-red-800'>{displayError}</p>
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className='space-y-6'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Current Password
                  </label>
                  <input
                    type='password'
                    name='currentPassword'
                    value={passwordForm.currentPassword}
                    onChange={handleInputChange}
                    className='input'
                    required
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    New Password
                  </label>
                  <input
                    type='password'
                    name='newPassword'
                    value={passwordForm.newPassword}
                    onChange={handleInputChange}
                    className='input'
                    required
                    minLength={6}
                  />
                </div>

                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    Confirm New Password
                  </label>
                  <input
                    type='password'
                    name='confirmPassword'
                    value={passwordForm.confirmPassword}
                    onChange={handleInputChange}
                    className='input'
                    required
                    minLength={6}
                  />
                </div>

                <div className='flex justify-end'>
                  <button
                    type='submit'
                    disabled={passwordChangeLoading}
                    className='btn btn-primary'
                  >
                    {passwordChangeLoading ? <LoadingSpinner size='sm' /> : 'Change Password'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Account Information */}
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <h2 className='text-xl font-semibold text-gray-900 mb-6'>
          Account Information
        </h2>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
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
          <div>
            <span className='text-sm font-medium text-gray-500'>Role</span>
            <p className='text-gray-900 capitalize'>{user?.role || 'user'}</p>
          </div>
          <div>
            <span className='text-sm font-medium text-gray-500'>
              Member Since
            </span>
            <p className='text-gray-900'>
              {formatDate(user?.createdAt)}
            </p>
          </div>
          <div>
            <span className='text-sm font-medium text-gray-500'>
              Last Login
            </span>
            <p className='text-gray-900'>
              {formatDate(user?.lastLogin)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
