import React, { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  HiUsers,
  HiBriefcase,
  HiDocumentText,
  HiChartBar,
  HiSearch,
  HiRefresh,
} from 'react-icons/hi';
import { formatDate } from '../utils/formatUtils';
import Pagination from '../components/UI/Pagination';
import api from '../utils/api';

// --- Reusable sub-components ---

const StatusBadge = ({ active }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
    }`}
  >
    {active ? 'Active' : 'Inactive'}
  </span>
);

const SearchInput = ({ value, onChange, placeholder }) => (
  <div className='relative'>
    <HiSearch className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400' />
    <input
      type='text'
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className='w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500'
    />
  </div>
);

const EmptyState = ({ icon: Icon, message }) => (
  <div className='text-center py-12'>
    <Icon className='h-12 w-12 text-gray-400 mx-auto mb-4' />
    <p className='text-gray-500'>{message}</p>
  </div>
);

// --- User Management Tab ---

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (roleFilter) params.role = roleFilter;
      if (activeFilter) params.isActive = activeFilter;
      const res = await api.get('/api/users', { params });
      setUsers(res.data.users);
      setPagination(res.data.pagination);
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [page, roleFilter, activeFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(userId);
    try {
      await api.put(`/api/users/${userId}`, { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, role: newRole } : u))
      );
    } catch {
      // silently fail
    }
    setActionLoading(null);
  };

  const handleToggleActive = async (userId, isActive) => {
    setActionLoading(userId);
    try {
      if (isActive) {
        await api.delete(`/api/users/${userId}`);
      } else {
        await api.post(`/api/users/${userId}/reactivate`);
      }
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, isActive: !isActive } : u))
      );
    } catch {
      // silently fail
    }
    setActionLoading(null);
  };

  return (
    <div className='space-y-4'>
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6'>
          <h2 className='text-xl font-semibold text-gray-900'>User Management</h2>
          <div className='flex gap-2'>
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className='border border-gray-300 rounded-lg px-3 py-2 text-sm'
            >
              <option value=''>All Roles</option>
              <option value='user'>User</option>
              <option value='admin'>Admin</option>
              <option value='moderator'>Moderator</option>
            </select>
            <select
              value={activeFilter}
              onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}
              className='border border-gray-300 rounded-lg px-3 py-2 text-sm'
            >
              <option value=''>All Status</option>
              <option value='true'>Active</option>
              <option value='false'>Inactive</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className='text-center py-8 text-gray-500'>Loading users...</div>
        ) : users.length === 0 ? (
          <EmptyState icon={HiUsers} message='No users found' />
        ) : (
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-gray-200'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>User</th>
                  <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>Role</th>
                  <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>Status</th>
                  <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>Joined</th>
                  <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>Actions</th>
                </tr>
              </thead>
              <tbody className='bg-white divide-y divide-gray-200'>
                {users.map((u) => (
                  <tr key={u._id} className='hover:bg-gray-50'>
                    <td className='px-4 py-3'>
                      <div>
                        <p className='text-sm font-medium text-gray-900'>{u.firstName} {u.lastName}</p>
                        <p className='text-xs text-gray-500'>{u.email}</p>
                      </div>
                    </td>
                    <td className='px-4 py-3'>
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u._id, e.target.value)}
                        disabled={actionLoading === u._id}
                        className='border border-gray-300 rounded px-2 py-1 text-xs'
                      >
                        <option value='user'>User</option>
                        <option value='admin'>Admin</option>
                        <option value='moderator'>Moderator</option>
                      </select>
                    </td>
                    <td className='px-4 py-3'>
                      <StatusBadge active={u.isActive} />
                    </td>
                    <td className='px-4 py-3 text-sm text-gray-500'>
                      {formatDate(u.createdAt)}
                    </td>
                    <td className='px-4 py-3'>
                      <button
                        onClick={() => handleToggleActive(u._id, u.isActive)}
                        disabled={actionLoading === u._id}
                        className={`text-xs font-medium px-3 py-1 rounded ${
                          u.isActive
                            ? 'text-red-700 bg-red-50 hover:bg-red-100'
                            : 'text-green-700 bg-green-50 hover:bg-green-100'
                        } disabled:opacity-50`}
                      >
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        currentPage={pagination.page || 1}
        totalPages={pagination.pages || 1}
        total={pagination.total || 0}
        pageSize={pagination.limit || 20}
        onPageChange={setPage}
        label='users'
      />
    </div>
  );
};

// --- Job Management Tab ---

const JobManagement = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search) params.q = search;
      if (sourceFilter) params.source = sourceFilter;
      const res = await api.get('/api/jobs/admin', { params });
      setJobs(res.data.jobs);
      setPagination(res.data.pagination);
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [page, search, sourceFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className='space-y-4'>
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6'>
          <h2 className='text-xl font-semibold text-gray-900'>Job Management</h2>
          <div className='flex gap-2'>
            <select
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              className='border border-gray-300 rounded-lg px-3 py-2 text-sm'
            >
              <option value=''>All Sources</option>
              <option value='nyc'>NYC</option>
              <option value='federal'>Federal</option>
              <option value='nys'>State</option>
            </select>
            <button
              onClick={fetchJobs}
              className='p-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg'
              title='Refresh'
            >
              <HiRefresh className='h-4 w-4' />
            </button>
          </div>
        </div>

        <form onSubmit={handleSearch} className='mb-4'>
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder='Search jobs by title, agency, category...'
          />
        </form>

        {loading ? (
          <div className='text-center py-8 text-gray-500'>Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <EmptyState icon={HiBriefcase} message='No jobs found' />
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full divide-y divide-gray-200 table-auto'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase'>Job</th>
                  <th className='px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell'>Agency</th>
                  <th className='px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase'>Source</th>
                  <th className='px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase'>Saves</th>
                  <th className='px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell'>Posted</th>
                  <th className='px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase hidden md:table-cell'>Min Salary</th>
                  <th className='px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase hidden md:table-cell'>Max Salary</th>
                </tr>
              </thead>
              <tbody className='bg-white divide-y divide-gray-200'>
                {jobs.map((job) => (
                  <tr key={`${job.source}-${job.jobId}`} className='hover:bg-gray-50'>
                    <td className='px-3 py-3 max-w-[150px] xl:max-w-none'>
                      <div>
                        <p className='text-sm font-medium text-gray-900 truncate xl:whitespace-normal'>{job.businessTitle}</p>
                        <p className='text-xs text-gray-500 truncate xl:whitespace-normal'>{job.workLocation || 'No location'}</p>
                      </div>
                    </td>
                    <td className='px-3 py-3 text-sm text-gray-500 hidden lg:table-cell max-w-[200px] xl:max-w-none truncate xl:whitespace-normal'>
                      {job.agency || '-'}
                    </td>
                    <td className='px-3 py-3'>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        job.source === 'federal' ? 'bg-blue-100 text-blue-800' : job.source === 'nys' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        {job.source === 'federal' ? 'Federal' : job.source === 'nys' ? 'State' : 'NYC'}
                      </span>
                    </td>
                    <td className='px-3 py-3 text-sm text-gray-500 text-center'>
                      {job.saveCount || 0}
                    </td>
                    <td className='px-3 py-3 text-sm text-gray-500 hidden sm:table-cell whitespace-nowrap'>
                      {formatDate(job.postDate)}
                    </td>
                    <td className='px-3 py-3 text-sm text-gray-500 text-right hidden md:table-cell whitespace-nowrap'>
                      {job.salaryRangeFrom ? `$${job.salaryRangeFrom.toLocaleString()}` : '-'}
                    </td>
                    <td className='px-3 py-3 text-sm text-gray-500 text-right hidden md:table-cell whitespace-nowrap'>
                      {job.salaryRangeTo ? `$${job.salaryRangeTo.toLocaleString()}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        currentPage={pagination.page || 1}
        totalPages={pagination.pages || 1}
        total={pagination.total || 0}
        pageSize={pagination.limit || 20}
        onPageChange={setPage}
        label='jobs'
      />
    </div>
  );
};

// --- Notes Management Tab ---

const NotesManagement = () => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (typeFilter) params.type = typeFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const res = await api.get('/api/notes/admin', { params });
      setNotes(res.data.notes);
      setPagination(res.data.pagination);
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [page, typeFilter, priorityFilter]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleDelete = async (noteId) => {
    if (!window.confirm('Delete this note? This action cannot be undone.')) return;
    setActionLoading(noteId);
    try {
      await api.delete(`/api/notes/${noteId}`);
      setNotes((prev) => prev.filter((n) => n._id !== noteId));
    } catch {
      // silently fail
    }
    setActionLoading(null);
  };

  const priorityColor = (p) => {
    const map = {
      urgent: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800',
    };
    return map[p] || map.medium;
  };

  const typeColor = (t) => {
    const map = {
      general: 'bg-gray-100 text-gray-700',
      interview: 'bg-blue-100 text-blue-800',
      application: 'bg-green-100 text-green-800',
      followup: 'bg-purple-100 text-purple-800',
      research: 'bg-indigo-100 text-indigo-800',
    };
    return map[t] || map.general;
  };

  return (
    <div className='space-y-4'>
      <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6'>
          <h2 className='text-xl font-semibold text-gray-900'>Notes Management</h2>
          <div className='flex gap-2'>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className='border border-gray-300 rounded-lg px-3 py-2 text-sm'
            >
              <option value=''>All Types</option>
              <option value='general'>General</option>
              <option value='interview'>Interview</option>
              <option value='application'>Application</option>
              <option value='followup'>Follow-up</option>
              <option value='research'>Research</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
              className='border border-gray-300 rounded-lg px-3 py-2 text-sm'
            >
              <option value=''>All Priorities</option>
              <option value='urgent'>Urgent</option>
              <option value='high'>High</option>
              <option value='medium'>Medium</option>
              <option value='low'>Low</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className='text-center py-8 text-gray-500'>Loading notes...</div>
        ) : notes.length === 0 ? (
          <EmptyState icon={HiDocumentText} message='No notes found' />
        ) : (
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-gray-200'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>Note</th>
                  <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>User</th>
                  <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>Type</th>
                  <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>Priority</th>
                  <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>Created</th>
                  <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>Actions</th>
                </tr>
              </thead>
              <tbody className='bg-white divide-y divide-gray-200'>
                {notes.map((note) => (
                  <tr key={note._id} className='hover:bg-gray-50'>
                    <td className='px-4 py-3'>
                      <div>
                        <p className='text-sm font-medium text-gray-900 line-clamp-1'>{note.title}</p>
                        {note.jobId && (
                          <p className='text-xs text-gray-400'>Job: {note.jobId}</p>
                        )}
                      </div>
                    </td>
                    <td className='px-4 py-3'>
                      {note.user ? (
                        <div>
                          <p className='text-sm text-gray-900'>{note.user.firstName} {note.user.lastName}</p>
                          <p className='text-xs text-gray-500'>{note.user.email}</p>
                        </div>
                      ) : (
                        <span className='text-sm text-gray-400'>Unknown</span>
                      )}
                    </td>
                    <td className='px-4 py-3'>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${typeColor(note.type)}`}>
                        {note.type}
                      </span>
                    </td>
                    <td className='px-4 py-3'>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${priorityColor(note.priority)}`}>
                        {note.priority}
                      </span>
                    </td>
                    <td className='px-4 py-3 text-sm text-gray-500'>
                      {formatDate(note.createdAt)}
                    </td>
                    <td className='px-4 py-3'>
                      <button
                        onClick={() => handleDelete(note._id)}
                        disabled={actionLoading === note._id}
                        className='text-xs font-medium px-3 py-1 rounded text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50'
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        currentPage={pagination.page || 1}
        totalPages={pagination.pages || 1}
        total={pagination.total || 0}
        pageSize={pagination.limit || 20}
        onPageChange={setPage}
        label='notes'
      />
    </div>
  );
};

// --- Main Admin Component ---

const Admin = () => {
  const { user } = useSelector((state) => state.auth);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalNotes: 0,
    totalSavedJobs: 0,
    activeUsers: 0,
  });
  const [recentUsers, setRecentUsers] = useState([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/api/users/stats');
        setStats({
          totalUsers: response.data.totalUsers || 0,
          activeUsers: response.data.activeUsers || 0,
          totalNotes: response.data.totalNotes || 0,
          totalSavedJobs: response.data.totalSavedJobs || 0,
        });
        setRecentUsers(response.data.recentUsers || []);
      } catch (error) {
        // Stats are non-critical; silently fail
      }
    };
    fetchStats();
  }, []);

  const tabs = [
    { key: 'dashboard', label: 'Dashboard', icon: HiChartBar },
    { key: 'users', label: 'User Management', icon: HiUsers },
    { key: 'jobs', label: 'Job Management', icon: HiBriefcase },
    { key: 'notes', label: 'Notes Management', icon: HiDocumentText },
  ];

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
              {tabs.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === key
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className='inline h-4 w-4 mr-2' />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className='lg:col-span-3'>
          {activeTab === 'dashboard' && (
            <div className='space-y-6'>
              {/* Stats Cards */}
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
                {[
                  { icon: HiUsers, color: 'text-primary-600', label: 'Total Users', value: stats.totalUsers },
                  { icon: HiBriefcase, color: 'text-green-600', label: 'Saved Jobs', value: stats.totalSavedJobs },
                  { icon: HiDocumentText, color: 'text-blue-600', label: 'Total Notes', value: stats.totalNotes },
                  { icon: HiUsers, color: 'text-orange-600', label: 'Active Users', value: stats.activeUsers },
                ].map(({ icon: Icon, color, label, value }) => (
                  <div key={label} className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                    <div className='flex items-center'>
                      <Icon className={`h-8 w-8 ${color}`} />
                      <div className='ml-4'>
                        <p className='text-sm font-medium text-gray-500'>{label}</p>
                        <p className='text-2xl font-semibold text-gray-900'>{value}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent Users */}
              {recentUsers.length > 0 && (
                <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                  <h3 className='text-lg font-semibold text-gray-900 mb-4'>
                    Recent Users
                  </h3>
                  <div className='space-y-4'>
                    {recentUsers.map((u) => (
                      <div key={u._id} className='flex items-center space-x-4'>
                        <div className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                        <div className='flex-1'>
                          <p className='text-sm text-gray-900'>
                            {u.firstName} {u.lastName}
                          </p>
                          <p className='text-xs text-gray-500'>
                            {u.email} &middot; {u.role} &middot; Joined {formatDate(u.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'jobs' && <JobManagement />}
          {activeTab === 'notes' && <NotesManagement />}
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
