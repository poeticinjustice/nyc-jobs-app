# NYC Jobs - MERN Stack Application

**Created by Ramzi using Cursor, largely to test its AI capabilities**

A comprehensive job search and management application for NYC government job postings, built with the MERN stack (MongoDB, Express.js, React, Node.js) and Redux Toolkit. This application provides fast, efficient search through NYC government job postings with advanced filtering, user authentication, job management, and comprehensive note-taking capabilities.

## 🚀 Quick Start

```bash
# Install dependencies
npm install
npm run install-client

# Set up environment variables
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret

# Start development servers
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application!

## ✨ Key Features

### 🔍 Advanced Job Search & Management

- **Complete NYC Jobs Dataset** - Search through 6,000+ NYC government job postings
- **Smart Search with Caching** - Intelligent caching system for optimal performance
- **Advanced Filtering** - Filter by category, location, salary range, and keywords
- **Multiple Sort Options** - Sort by date (newest/oldest), title (A-Z/Z-A), salary (highest/lowest)
- **Results Per Page** - Choose between 20, 50, or 100 results per page
- **Pagination** - Navigate through large result sets with URL state persistence
- **Real-time Bookmarking** - Save and unsave jobs with immediate visual feedback
- **Bookmark Status in Search** - See which jobs are already bookmarked in search results
- **Mobile-Optimized Search** - Responsive search interface that works on all devices

### 📝 Comprehensive Notes System

- **Job-Linked Notes** - Create notes directly linked to specific job postings
- **Automatic Job Association** - Notes automatically fetch and save job data from NYC API
- **Note Categories** - Organize notes by type (general, interview, application, followup, research)
- **Priority Levels** - Set priority (low, medium, high, urgent) for better organization
- **Rich Text Support** - Support for formatted text with automatic paragraph breaks
- **Pagination** - Navigate through large note collections efficiently
- **Advanced Filtering** - Filter notes by category, priority, and date
- **Real-time Updates** - Immediate synchronization between notes and job data

### 👤 User Authentication & Management

- **JWT-based Authentication** - Secure token-based user sessions
- **Role-based Access Control** - User, Admin, and Moderator roles
- **Profile Management** - Update personal information and preferences
- **Password Security** - Secure password change with bcrypt hashing
- **Session Management** - Persistent login across browser sessions

### 🎨 Modern, Responsive UI/UX

- **Tailwind CSS Design** - Clean, modern interface with utility-first styling
- **Mobile-First Approach** - Optimized for all screen sizes and devices
- **Intuitive Navigation** - Clear, accessible navigation with breadcrumbs
- **Loading States** - Smooth loading indicators and skeleton screens
- **Error Handling** - Graceful error messages with recovery options
- **Toast Notifications** - Real-time feedback for user actions
- **Accessibility** - Keyboard navigation and screen reader support

### 🔧 Administrative Features

- **User Management Dashboard** - Comprehensive user administration tools
- **System Analytics** - View user statistics and system performance
- **Role Management** - Manage user roles and permissions
- **Database Monitoring** - Track system health and performance

## 🛠️ Tech Stack

### Backend

- **Node.js** - Runtime environment
- **Express.js** - Web framework with optimized routing and middleware
- **MongoDB Atlas** - Cloud database with automatic scaling
- **Mongoose** - ODM with advanced indexing and population
- **JWT** - Secure authentication tokens
- **bcryptjs** - Password hashing and verification
- **express-validator** - Comprehensive input validation
- **helmet** - Security headers and protection
- **cors** - Cross-origin resource sharing
- **axios** - HTTP client with timeout protection and retry logic
- **express-rate-limit** - Rate limiting for API protection

### Frontend

- **React 18** - Modern UI library with hooks and concurrent features
- **Redux Toolkit** - Efficient state management with async thunks
- **React Router v6** - Client-side routing with protected routes
- **Tailwind CSS** - Utility-first CSS framework
- **React Hook Form** - Performant form handling with validation
- **React Hot Toast** - Beautiful toast notifications
- **React Icons** - Comprehensive icon library (Heroicons)
- **Axios** - Promise-based HTTP client with interceptors

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **MongoDB Atlas** account (recommended) or local MongoDB
- **Git** for version control

## 🚀 Installation & Setup

### 1. Install Dependencies

```bash
# Install server dependencies
npm install

# Install client dependencies
npm run install-client
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Update the `.env` file with your configuration:

```env
# MongoDB Connection (Replace with your MongoDB Atlas URI)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

# JWT Secret (Generate a strong secret for production)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Server Configuration
PORT=8000
NODE_ENV=development

# NYC Jobs API
NYC_JOBS_API_URL=https://data.cityofnewyork.us/resource/kpav-sd4t.json

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 3. Start the Application

#### Development Mode (Recommended)

```bash
npm run dev
```

This starts both the backend server (port 8000) and frontend development server (port 3000).

#### Individual Services

```bash
# Start only the backend server
npm run server

# Start only the frontend client
npm run client
```

#### Production Mode

```bash
# Build the client
npm run build

# Start the server
npm start
```

## 🌐 Application Access

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Health Check**: http://localhost:8000/api/jobs/health

## 🔌 API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/password` - Change password

### Jobs

- `GET /api/jobs/search` - Advanced job search with filtering, pagination, sorting, and smart caching
- `GET /api/jobs/:id` - Get detailed job information
- `POST /api/jobs/:id/save` - Save job to user's bookmarks
- `DELETE /api/jobs/:id/save` - Remove job from saved list
- `GET /api/jobs/saved` - Get user's saved jobs with pagination
- `GET /api/jobs/categories` - Get all available job categories
- `GET /api/jobs/health` - API health check and cache status
- `GET /api/jobs/nyc-api-health` - NYC Jobs API health check

### Notes

- `POST /api/notes` - Create note for a job (auto-fetches job data if needed)
- `GET /api/notes` - Get user's notes with pagination and filtering
- `GET /api/notes/:id` - Get specific note by ID
- `PUT /api/notes/:id` - Update note
- `DELETE /api/notes/:id` - Delete note
- `GET /api/notes/job/:jobId` - Get all notes for a specific job
- `GET /api/notes/stats` - Get note statistics

### Users (Admin)

- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get user by ID (admin only)
- `PUT /api/users/:id` - Update user (admin only)
- `DELETE /api/users/:id` - Delete user (admin only)
- `GET /api/users/stats` - Get user statistics (admin only)

## 📁 Project Structure

```
NYCJobs/
├── server/
│   ├── index.js              # Server entry point with rate limiting and health checks
│   ├── models/               # Database models
│   │   ├── User.js          # User authentication and management
│   │   ├── Job.js           # Job data and bookmark tracking
│   │   └── Note.js          # Notes with job associations
│   ├── routes/               # API routes
│   │   ├── auth.js          # Authentication endpoints
│   │   ├── jobs.js          # Job search, details, and bookmarking
│   │   ├── notes.js         # Notes CRUD operations
│   │   └── users.js         # User management (admin)
│   └── middleware/           # Custom middleware
│       └── auth.js          # JWT authentication middleware
├── client/
│   ├── src/
│   │   ├── components/       # React components
│   │   │   ├── Auth/        # Login/Register forms
│   │   │   ├── Layout/      # Navigation and layout
│   │   │   ├── Notes/       # Note creation and editing
│   │   │   └── UI/          # Reusable UI components
│   │   ├── pages/           # Page components
│   │   │   ├── JobSearch.js # Advanced job search with filters
│   │   │   ├── JobDetails.js # Detailed job view
│   │   │   ├── Notes.js     # Notes management
│   │   │   ├── SavedJobs.js # Bookmarked jobs
│   │   │   └── Admin.js     # Admin dashboard
│   │   ├── store/           # Redux store
│   │   │   └── slices/      # Redux slices for state management
│   │   ├── utils/           # Utility functions
│   │   │   └── textUtils.js # Text formatting and HTML rendering
│   │   └── App.js           # Main application component
│   ├── package.json
│   └── tailwind.config.js
├── package.json
├── render.yaml               # Render deployment configuration
└── README.md
```

## 🗄️ Database Schema

### User Model

- Email, password, first name, last name
- Role (user, admin, moderator)
- Active status, last login timestamp
- Saved jobs references

### Job Model

- NYC API job data (job_id, title, description, salary, etc.)
- Saved by users tracking
- View count and analytics
- Search indexing for performance

### Note Model

- User and job references with automatic population
- Title, content, type, priority, tags
- Privacy settings and visibility
- Timestamps for creation and updates

## ⚡ Performance & Security Features

### Performance Optimizations

- **Smart Caching** - Intelligent caching system for NYC API responses
- **API Optimization** - Leverages NYC API's native search capabilities
- **Batch Processing** - Efficient handling of large datasets
- **Timeout Protection** - 30-second timeouts prevent hanging requests
- **Pagination** - Efficient handling of large result sets
- **URL State Persistence** - Search parameters and pagination state in URL
- **Debounced Search** - Optimized search input handling

### Security Features

- **JWT Authentication** - Secure token-based authentication
- **Password Hashing** - bcrypt with salt rounds
- **Input Validation** - Comprehensive validation with express-validator
- **Rate Limiting** - API protection against abuse
- **CORS Configuration** - Secure cross-origin requests
- **Helmet Headers** - Security headers and protection
- **Role-based Access** - User, Admin, and Moderator roles
- **Trust Proxy** - Secure proxy configuration for production

## 🎯 Key Application Features

### Job Search Experience

- **Instant Search** - Real-time search results with smart caching
- **Advanced Filters** - Category, location, salary range, and keyword filtering
- **Multiple Sort Options** - Date, title, and salary sorting
- **Results Per Page** - Choose between 20, 50, or 100 results
- **Pagination** - Navigate through results with URL state persistence
- **Bookmark Integration** - See saved status and manage bookmarks directly from search

### Notes Management

- **Job-Linked Notes** - Create notes directly linked to specific jobs
- **Automatic Job Fetching** - Notes automatically retrieve job data from NYC API
- **Rich Organization** - Categorize by type, priority, and tags
- **Advanced Filtering** - Filter notes by multiple criteria
- **Pagination** - Handle large note collections efficiently

### User Experience

- **Mobile-First Design** - Optimized for all device sizes
- **Real-time Feedback** - Immediate response to user actions
- **Intuitive Navigation** - Clear, accessible interface
- **Loading States** - Smooth transitions and feedback
- **Error Handling** - Graceful error recovery

## 🚀 Deployment

### Render Deployment

The application includes a `render.yaml` file for easy deployment on Render:

1. Connect your GitHub repository to Render
2. Render will automatically detect the configuration
3. Set environment variables in the Render dashboard
4. Deploy with one click

### Environment Variables for Production

```env
MONGODB_URI=your_production_mongodb_uri
JWT_SECRET=your_production_jwt_secret
NODE_ENV=production
NYC_JOBS_API_URL=https://data.cityofnewyork.us/resource/kpav-sd4t.json
```

### Docker Deployment

```bash
# Build image
docker build -t nyc-jobs-app .

# Run container
docker run -p 8000:8000 -e MONGODB_URI=your_uri nyc-jobs-app
```

## 📊 Data Source

This application integrates with the [NYC Jobs API](https://data.cityofnewyork.us/resource/kpav-sd4t.json) to provide access to current NYC government job postings. The application implements intelligent caching and rate limiting to respect API constraints while providing optimal performance.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Note**: This application was created to test and demonstrate AI capabilities in software development. It showcases modern web development practices, comprehensive feature implementation, and robust architecture design.
